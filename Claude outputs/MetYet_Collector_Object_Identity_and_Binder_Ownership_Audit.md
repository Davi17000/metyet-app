# MetYet — Collector Object Identity and Binder Ownership Audit

Audit only. **Nothing was modified.** No code, test, migration, fixture, document
or schema was changed; no migration was written; the candidate branch was not
merged; nothing was implemented.

Throughout, every claim is marked **[F]** observed repository fact, **[I]**
architectural inference, or **[D]** product decision required.

---

## 1. Executive conclusion

**The corrected object model is already three-quarters implemented, and the
place it is missing is exactly one: the Binder.**

- **A Goal already *is* the durable sought-copy object.** [F] It carries an
  owner, an exact canonical card, exact `desired` criteria, a tier, a lifecycle
  and a stable id — and every derivation in the system is already keyed on that
  id: True Match (`goalId::partnerId`), the Opportunity (`opp.goalId`), the
  negotiation lock, the removal lock and Deal Flow's grouping.
  `validateWorld` **accepts many Goals per card today, unchanged.** Exactly two
  things constrain it to one per card: one line
  (`domain/metyet-commands.js:424`, the `duplicate-goal` refusal) and one index
  (`persistence/migrations/0008_goal_canonical_card.sql:54`).
- **A CollectorCopy already *is* the durable owned-copy object.** [F] Four copies
  of one card keep independent identity through grade, condition, cert, photos,
  market, `offered`, `keeping`, derived status, the partner projection, and
  every per-row decision inside a trade package.
- **The Binder is the only place the model is genuinely card-shaped.** [F] A
  membership is `{binderId, canonicalCardId, addedAt}` with **no id of its own**
  — the DB primary key is a positional `ord` reassigned on every save
  (`persistence/migrations/0013_binders.sql:86`,
  `persistence/world-repository.js:209-211`).

**And the argument that put it there has already been abandoned.** Migration
0013 states the card-level design and its reason verbatim [F]:

> *"MEMBERSHIP POINTS AT THE CANONICAL CARD, NOT AT A GOAL AND NOT AT A COPY.
> This is the whole design and it is load-bearing. `removeCollectorCopy` deletes
> a copy and cascades its interests; if membership named a copy, SELLING A CARD
> WOULD SILENTLY DELETE ITS PLACE IN THE BINDER, and organising would be
> collateral damage of a transaction."*
> — `persistence/migrations/0013_binders.sql:21-28`

The candidate branch's cascade **now deletes that membership anyway** when the
copy was the card's last state (`pruneOrphanedMemberships`,
`domain/metyet-commands.js:59-108`, called from `removeCollectorCopy:1074`).
[I] **So the product already pays the exact cost that card-level membership
existed to avoid, and keeps none of its benefit.** That is the single most
important finding in this audit: the case for card-level membership is not
merely weaker under the correction — it has already been given up.

**Recommended direction, to be decided rather than assumed** [I]: not a
polymorphic join table and not a new noun. Put `binderId` **on the object** —
one nullable field on Goal and one on CollectorCopy. This *deletes* the
`binder_entries` table, `cardHasState`, the `addBinderEntry` guard, most of
`pruneOrphanedMemberships`, the command-plan ordering hazard, and roughly 280
lines of tests written to defend them. It is the only option evaluated here
where the complexity goes down.

**Two foundational contradictions surfaced rather than solved** (§14, §15):

1. **[F] `proposeTradeSelection` never checks `offered` or `keeping`.** A copy
   marked PC can be put in a trade package, and it then crosses to the partner —
   with grade, condition, cert and both photographs — via `referencedCopies`,
   labelled `"reserved"`. `keeping` itself does not cross, so the field-level
   rule holds; **the row the projection header says "never reaches a partner at
   all" does reach them.** I asserted in the four-state hand-back §11 that this
   protection was *doubled*. **That claim was wrong.** It is single, and it rests
   entirely on no surface ever sending a kept copy id. Unreachable through the
   production door today (the command is unexposed) — reachable the day trade
   ships.
2. **[F] `updateGoalCriteria` has no `goal-locked` guard**, unlike
   `updateGoalTier` and `removeGoal`. Criteria can be rewritten while a deal is
   live, after which the deal's own admission gate cannot be reproduced from
   stored state. `updateGoalCriteria` **is exposed today**; this becomes
   reachable the day `startOpportunity` ships, not the day trade does.

And one live production defect found in passing: **[F] `draftKey` is dead code**
(written at `client/collector/CardSpecification.jsx:199`, read by nothing), so a
Save retried after a partial failure **re-sends `record-copy` and creates a
duplicate physical copy**. Flow 7 is production-reachable today.

---

## 2. Current identity map

[F] throughout. `persistence/migrations/0001_canonical_world.sql:6-20` states the
storage rule: columns hold identity, `ord` and inter-record references;
everything else lives in `attrs` jsonb, with a few STORED GENERATED columns
derived from it.

| Noun | Durable key | Referent | References | Stored | Survives to client |
|---|---|---|---|---|---|
| canonical card | `canonical_card_id`, `natural_key` unique | one exact printing | `card_context_id` | `metyet_catalog.canonical_cards`, typed columns | yes |
| legacy catalog card | `catalog_cards.id` | demo card; folds grade+condition into identity | — | `catalog_cards` | yes, as `state.catalog` |
| **Goal** | `goals.id`; **unique `(collector_id, canonical_card_id)`** (`0008:54`) | one Collector wanting one exact card | exactly one of `canonicalCardId` \| `cardId` | cols + `desired`, `note`, `createdAt` in **attrs**; `tier` generated | yes, whole; to TP via `GOAL_FOR_PARTNER` **including `desired`** |
| **CollectorCopy** | `collector_copies.id` | one physical card the Collector holds | one of `canonicalCardId` \| `cardId` | cols + `offered`, `keeping`, `grade`, `condition`, `cert`, `photos`, `market` in **attrs** | yes, whole + derived `status`; to TP via `COLLECTOR_COPY_FOR_PARTNER` |
| Binder | `binders.id` | a named grouping | `collector_id` | cols + `name`, `createdAt`, `archivedAt` in **attrs** | yes |
| **BinderEntry** | **none.** DB PK is positional `ord`, reassigned every save. Logical key `(binderId, canonicalCardId)`, unique (`0013:100`) | "this card belongs here" | `binderId` + `canonicalCardId` **only** | cols + `addedAt` | yes — **and arrives with no id** |
| TP inventory copy | `inventory_copies.inv_id` | one physical card a shop holds | one of `canonicalCardId` \| `cardId` | cols + `ask`, `cost`, `photos`, `pendingFor` in attrs | yes, via `INVENTORY_FOR_COLLECTOR` |
| discovery (True Match) | `goalId + "::" + partnerId` | this Goal ↔ this shop's matching copies | `goalId`, `partnerId`, `canonicalCardId`, **`invIds[]`** | **derived, never stored** | yes |
| copy review | `copy_reviews.id` | one Collector inspecting one TP copy | `collectorId`, `partnerId`, **`invId`** — **no `goalId`** | cols + attrs | yes (own only) |
| photo request | `photo_requests.id` | ask to be shown one TP copy | `collectorId`, `partnerId`, **`invId`** — **no `goalId`** | cols + attrs | yes (own only) |
| Opportunity | `opportunities.id` | one Collector's offer on one TP copy | `goalId` (**no FK**, deliberate — `0001:26-28`), `invId`, one card ref | cols + the whole negotiation aggregate in attrs | yes, minus TP-private |
| Deal Flow grouping | `goal.id` | client-only heading | discoveries by `goalId` | not stored | client-only |
| trade card in a package | `"tc"+cardId+"-"+token` | one CollectorCopy inside a package | **`binderId` = a CollectorCopy id** (legacy name) + card ref | `opportunities.attrs.trade.cards[]`, mirrored to `opportunity_trade_refs` | yes |

**Legacy identities still coexisting** [F]: `card_id` predates
`canonical_card_id` on `goals`, `inventory_copies`, `collector_copies`,
`opportunities` and `opportunity_trade_refs`; `validateWorld` requires exactly
one and refuses both. `conversations.card_id` is **still legacy-only** and
`D.threadKey` is computed from a legacy card — so conversations cannot be started
from canonical identity at all, and no migration addresses it.

**The second legacy name matters more than it looks** [F]:
`interests.binder_id` and `opportunity_trade_refs.binder_id` **name a
CollectorCopy, not a Binder** (`0011:14-20`, `0013:47-59`). The domain parameter
`binderIds` in `proposeTradeSelection` and `setInterest` carries the same wrong
name. `binder_entries.binder_id` is the only column in the schema that truly
names a Binder.

---

## 3. Exactly where generic-card identity enters Collector behaviour

[F] Each with file, function, what goes in, what comes out, and whether the
specific object is recoverable.

| # | Site | In → out | Recoverable? |
|---|---|---|---|
| 1 | `client/collector/sections/Collection.jsx:121-133` `groupIdOf` | entry \| Goal \| copy → one card key | **Copies yes** (re-attached, `key={copy.id}`); **which binder, no** — `binderId` is discarded |
| 2 | `Collection.jsx:288` `withCopies = kind !== "binder"` | four copies → **one card row, zero copy rows** | **No, on that screen.** This is the single line that guarantees a binder never shows a copy |
| 3 | `client/collector/sections/Binder.jsx:92-98` `cardsIn`/`countOf` | entries → `Set.size` | No — "3 cards" may be 7 objects |
| 4 | `Binder.jsx:103-107` `filedSomewhereActive` | entries across all binders → Set of card ids | Which binder, no |
| 5 | `client/collector/sections/Browse.jsx:75,78` `wanted`/`owned` | N goals, N copies → two **booleans** | No — "you own one" with three |
| 6 | `client/collector/sections/Goals.jsx:73-78` `filedIn`/`otherState` | entries, copies → a count and a boolean, by card | No |
| 7 | `client/collector/CardSpecification.jsx:117` `goals.find(g => …)` | N goals → **the first** | No — and see §4 |
| 8 | `CardSpecification.jsx:116,264` `filedNow = Set(binderId)` | entries → binder ids for **the card** | Which object, no |
| 9 | `domain/metyet-domain.js:1538-1561` `collectorStatesFor` / `cardHasState` | card + goals + copies → list of labels | **Which** Goal and **which** copy produced each label is discarded |
| 10 | `domain/metyet-commands.js:96-108` `pruneOrphanedMemberships` | deletes entries by `(binderId, canonicalCardId)` | **No** — entries have no id, so a destroyed entry cannot be named afterwards |
| 11 | `client/tp/sections/CollectorNetwork.jsx:541` | three distinguishable offered rows → the string `"3"` | **No — and this is the only TP surface for a Collector's supply** |
| 12 | `client/tp/sections/Opportunities.jsx:134` | discovery with `invIds[]` → `d.copies` count | Merely not rendered — `invIds` is in the prop |
| 13 | `client/collector/sections/DealFlow.jsx:149-152` `nearMissCount` | inventory filtered by card → `.length` | Deliberate |
| 14 | `domain/metyet-discovery.js:163-172` `byCard` | join predicate is card equality | **Yes** — `invIds` carries the exact copies through |

**[I] The pattern:** the *domain* almost never loses a specific identity. Loss is
concentrated in three places — the Binder's durable shape (#2, #10), the one TP
supply surface (#11), and Browse's booleans (#5).

---

## 4. Goal / sought-copy analysis

**Can one Collector hold two simultaneous Goals for one card? No — twice.** [F]

```
goal#1 (primary, PSA 10):   {"ok":true,"value":"g771…"}
goal#2 (secondary, Raw NM): {"ok":false,"refused":"duplicate-goal"}
```

`domain/metyet-commands.js:422-427` — `mine.some(g => g.canonicalCardId ===
canonical)`. **The check reads only the card id; `desired` is never consulted.**
And `persistence/migrations/0008_goal_canonical_card.sql:54` declares
`goals_one_per_collector_card_idx unique (collector_id, canonical_card_id)`.
[F] Note it is a bare index, **not** `deferrable initially deferred` — the only
uniqueness rule in the schema that is not, against the rule stated at `0001:83-85`.
[I] No latent 500 today because domain and DB forbid the same thing; relaxing the
domain alone would produce a raw `23505`, and `persistence/errors.js` has no
unique-violation code, so it would surface as `persistence.database`.

**What enforces versus what merely assumes** [F]:

| Site | Verdict |
|---|---|
| `addGoal` `duplicate-goal` (`commands.js:424`) | **ENFORCES** |
| `0008:54` unique index | **ENFORCES** |
| `validateWorld` goals block (`metyet-world.js:203-231`) | **NEITHER** — probed a two-goal world: `{"ok":true,"errors":[]}` |
| `metyet-discovery.js` | **NEITHER** — keyed `goalId::partnerId` |
| `collectorStatesFor`, `pruneOrphanedMemberships` | **NEITHER** — disjunctions over all goals |
| `Goals.jsx` (`key={goal.id}`, `otherState` excludes `g.id !== goal.id`) | **NEITHER** — already written for many-per-card |
| `DealFlow.jsx` (`groupBy(…, "goalId")`) | **NEITHER** |
| `Collection.jsx:142-146` `goalFor` Map keyed by card | **ASSUMES** — last goal silently wins |
| `Collection.jsx:181,205` `new Set(cardKeys)` | **ASSUMES** — one tile per card |
| `CardSpecification.jsx:117,264` `.find(…)` | **ASSUMES, hardest** — `initialAnswers` collapses to one `want` tier and one `desired` pair |
| `Browse.jsx:75` `wanted` | **ASSUMES** — would not offer a second sought copy |

**True Match binds to Goal identity, not to the card.** [F] Two goals, one card,
two copies:

```
[{"key":"gA::p1","goalId":"gA","tier":"primary",  "invIds":["i1"],"copies":1},
 {"key":"gB::p1","goalId":"gB","tier":"secondary","invIds":["i2"],"copies":1}]
```

**Two rows, correctly partitioned by criteria. Discovery needs no change at all.**

**Qualification binds to the TP inventory copy only — never to a Goal.** [F]
`reviewCopy`, `endReview`, `requestPhotos` all take `{invId}`; the rows are
`{id, collectorId, partnerId, invId, …}` and there is no `goal_id` column.
[I] Qualification is already specific-copy shaped and already Goal-agnostic.

**`startOpportunity` preserves Goal identity.** [F] It stores `goalId`, `invId`
**and** `canonicalCardId`. No FK on `goalId`, deliberately (`0001:26-27`: *"a
completed or ended deal may keep the id of a Goal its collector has since
removed"*). `removeGoal` refuses `goal-locked` while the Opportunity is active;
once ended, the Goal deletes and the pointer dangles, which `validateWorld`
tolerates.

**Primary + Secondary on one card, if allowed** [F, probed]: `updateGoalTier` is
per-goal and there is **no "one Primary per card" rule anywhere** — two Primaries
on one card validate clean. `goalLocked` is per-goal. `collectorStatesFor`
returns `["primary","secondary"]`. `oneNegotiationPerGoal` is per-goal, so two
goals legitimately support two concurrent deals; both started successfully with
`validateWorld` clean. The one visible wrongness is `Collection.jsx:181`: the
card appears in **both** the Primary and Secondary views, reading as a duplicate
rather than as two sought copies.

**[I] Judgement: Goal can remain the noun.** Introducing a new sought-copy noun
would duplicate the Goal's id, criteria, tier and lifecycle and would orphan
`opportunities.goal_id`, `discoveryKey`, `goalLocked` and `goalNamedByActive`.
What is genuinely card-shaped is not the Goal; it is `CardSpecification.jsx`,
whose whole answer model is "one card → one tier + one `desired` pair", and
`Collection.jsx`'s card-keyed `goalFor`. Those are **UI cardinality assumptions,
not identity ones.**

**[D] Whether a Collector may hold two sought copies of one card is a product
decision this audit does not make.** It is not required by the corrected model —
a single sought copy per card is coherent. But §13 scenario 4 shows what it costs
to keep the restriction.

---

## 5. CollectorCopy / owned-copy analysis

**The load-bearing case, driven end to end** [F] — one card, four copies:
A = PSA 10 PC, B = PSA 9 Trade/Sell, C = Raw NM Trade/Sell, D = Raw LP
Trade/Sell, plus a Primary Goal for a PSA 10.

```
A status=available | disposition="keeping" | grading={label:"PSA 10"}
B status=available | disposition="offered" | grading={label:"PSA 9"}
C status=available | disposition="offered" | grading={label:"Raw · Near Mint"}
D status=available | disposition="offered" | grading={label:"Raw · Lightly Played"}
```

| Dimension | Holds? |
|---|---|
| `id` | holds everywhere |
| grade / condition | holds in state, projection and grading; **collapses inside a deal** — `emptyTradeCard` (`metyet-domain.js:1708-1719`) carries no grade or condition |
| cert, photos | hold; copied onto the trade row |
| `market` | holds, owner-only — stripped by `COLLECTOR_COPY_FOR_PARTNER` |
| `offered` / `keeping` | hold; two writers only; both-true refused |
| derived `status` | holds — `collectorCopyStatus` keys per copy |
| TP visibility | **holds per row in the projection; collapses to a count in the only TP screen** |
| trade use | holds by id; **collapses by label** — the receipt names every row `c.name` |
| transaction history | holds, but derived only — no per-copy ledger |

**The Collector's own projection returns all four rows, fully distinguishable.**
[F] **The partner's projection returns exactly three** — A is absent, `keeping`
and `market` are off the allow-list, and B, C, D arrive as three distinguishable
rows with grade, condition, cert and photos.

**The four verbs** [F/I]:

| Verb | Answer | Evidence |
|---|---|---|
| **DISPLAY** | **yes** | `Collection.jsx:373-415` renders one `<Record key={copy.id}>` per copy; `CardSpecification` edits each independently through three exposed commands |
| **ORGANISE** | **no** | membership is `{binderId, canonicalCardId}`; `Collection.jsx:288` suppresses copies inside a binder *by design* |
| **EXPOSE** | **no** | the domain sends three rows; `CollectorNetwork.jsx:541` renders `offeredCopies.length` — the only TP consumer of `collectorCopies` in the whole of `client/tp/` |
| **TRANSACT** | **no in production, yes in the domain** | `proposeTradeSelection` distinguishes B, C and D by id, reviews, values and commits each independently — but it and every other transaction command are absent from `EXPOSED_COMMANDS`, and `grep -rn "proposeTradeSelection" client/` returns **zero hits** |

```
proposeTradeSelection({binderIds:["B","C","D"]}) => {"ok":true}
statuses: A available  B reserved  C reserved  D reserved
reject B / accept C / accept D  =>  B available  C committed  D committed
per-row agreed: [{b:"B",inc:"rejected"},{b:"C",inc:"accepted"},{b:"D",inc:"accepted",mkt:20}]
```

**[F] And the hazard.** `proposeTradeSelection` checks existence, ownership,
photographs and reserved/committed status. **It never reads `offered` or
`keeping`.**

```
A.offered:false  A.keeping:true
proposeTradeSelection([A]) => {"ok":true}
partner now sees: {"id":"A","grade":"PSA 10","cert":"CERT-A",
                   "photos":{…},"offered":false,"status":"reserved"}
```

By contrast `setInterest` *does* guard it (`commands.js:1366-1375`, refuses
`not-found`). See §15.

---

## 6. Binder schema and cardinality analysis

**What a membership is** [F]: `{binderId, canonicalCardId, addedAt}`
(`commands.js:1214-1215`). Uniqueness on the pair in three places: the DB index,
`validateWorld`'s `${binderId}::${canonicalCardId}` duplicate key, and the
command's idempotent early return.

**Answers** [F, all probed]:

- **Same card in several binders?** Yes, uncapped. `CardSpecification.jsx:17`
  advertises it.
- **Two physical copies of one card, separately, in one binder?** **No.** Three
  distinct actionable objects (a Goal, an offered PSA 9, a kept PSA 10) collapse
  to one membership row; the unique index makes a second row unrepresentable even
  by hand.
- **An owned copy and a Goal for one card, separately?** **No** — same row.
- **An object with no binder?** Yes, trivially — `addGoal` and `addCollectorCopy`
  never mention binders, and `0013:73-78` says *"Existing Collectors have zero
  Binders, which is the correct and complete answer."* **[D]** whether an object
  *should* be forced into a home is not answered by the code.

**If membership named `goalId` / `collectorCopyId`** [I], the consumer list is
complete (grep of `binderEntries` across `client domain server`):

*Would change:* `addBinderEntry`/`removeBinderEntry`; `pruneOrphanedMemberships`;
`validateWorld:388-407`; `world-repository.js:110-111` plus a migration;
`Collection.jsx:160-165`; `Binder.jsx:92-107`; `CardSpecification.jsx:113-121,
217-222, 262-270`; `Goals.jsx:73-74`.

*Would NOT change:* `metyet-projection.js:427-428` and `:521-522`;
`createBinder`/`renameBinder`/`setBinderArchived`; `server/exposed-commands.js`;
`metyet-store.js`; every `interests`/`opportunity_trade_refs` `binderId` site
(unrelated legacy naming); `Collection.jsx`'s all/primary/secondary/trade
branches; **all four-state machinery in `metyet-domain.js:1509-1561`.**

### Polymorphic table versus a field on the object

**[I] Polymorphism is not necessary, and the field is the better fit.** The repo
already treats Goal and CollectorCopy as first-class rows with `attrs` jsonb, and
`world-repository.js:85-104` puts anything that is not identity or a foreign key
into `attrs` — so `binderId` on each costs one nullable column plus an index, or
**nothing at all** if left in `attrs`. Against that, `binder_entries` is deleted
outright: one table, one unique index, one FK, one repository spec.

`validateWorld` would gain a `ref(binders, x.binderId, …)` per object plus the
owner-match rule it already writes elsewhere (`metyet-world.js:547-549` is the
existing template), and would **lose** the duplicate check — a rule deleted
rather than moved, because one-to-one makes duplicates unrepresentable.

**[D] Cost:** `binder_entries.addedAt` — "when it was filed" — needs a second
field on the object or is lost.

**Moving between binders becomes an UPDATE.** [I] That collapses
`addBinderEntry`/`removeBinderEntry` into one setter and **removes the reason the
current command ordering is load-bearing**: `CardSpecification.jsx:205-222` orders
`file` before `unfile` precisely so *"a binder swap should not pass through a
moment of belonging nowhere"*. An UPDATE has no such moment.

### The complexity comparison — the reason to prefer this

[F] sizes; [I] fate.

| Thing | Where | Size | Under object-level membership |
|---|---|---|---|
| `collectorStatesFor` | `metyet-domain.js:1514-1552` | 24 comment + 15 code | **Survives** — it is the four-state vocabulary, read by the UI, not by membership |
| `cardHasState` | `:1553-1561` | 7 + 2 | **Unnecessary.** Its only two callers disappear |
| `addBinderEntry` guard | `commands.js:1183-1213` | 26 + 5, plus `REFUSE.cardHasNoState` | **Unnecessary.** Replaced by the lookup that must resolve the object anyway |
| `pruneOrphanedMemberships` | `:59-108` + 4 call sites | ~50 lines + 4 wrappings | **Two-thirds unnecessary.** Removing an object takes its home with it — an ordinary cascade, not a scan |
| The plan's withdrawals-last ordering | `CardSpecification.jsx:205-246` | the hazard itself | **The hazard disappears** |
| Tests | `tests/phase5-four-state-and-binder-invariant.cjs` (1,048 lines) | Section C is lines 286-563 (**278 lines**), Section D 564-727 | **C mostly discarded, D rewritten.** A, B, E survive — they are about the four states themselves |

**[I] Net: one table, one guard, one refusal code, one cascade, one ordering
constraint and ~280 lines of test all go away, and nothing takes their place
except a nullable field on two rows.**

---

## 7. Binder Archive analysis

[F] **Durable:** `binders.attrs.archivedAt` — a timestamp or null, no column.
**Command:** `setBinderArchived` (`commands.js:1136-1162`), deliberately a
reversible setter rather than a one-way `archiveBinder`, idempotent, exposed.
**Validation:** string or blank. **Projection:** none of its own; carried inside
the cloned binder, absent from the partner projection. **UI:**
`Binder.jsx:83-85, 294-320` (the active/archived split, "Show binders you've put
away (n)", "Put away"/"Bring back"); `Goals.jsx:71-74` counts only active
binders; `CardSpecification.jsx:289,316` hides archived binders from the tick
list and from preselect; `Collection.jsx:186-200` — **archived membership still
counts for All Cards.** **Domain:** `pruneOrphanedMemberships:99` filters
`!b.archivedAt`. **Tests:** `phase5-c31` (5 sites), `phase3-domain-readiness`,
`phase5-binders-cross-views`, and the candidate branch's `[21f]`.

**Does Archive preserve or protect anything beyond visibility?** [F] **One thing
only, and it is the prune skip.** Probed against an archived binder:
`addBinderEntry` OK, `removeBinderEntry` OK, `renameBinder` OK. Archiving blocks
no command. It protects entries from exactly one caller:

```
cc-x filed in active bA and archived bZ; removeGoal → OK
entries after: [{binderId: bZ, canonicalCardId:"cc-x"}]
archived binder KEPT its stateless membership: true   validateWorld: ok
```

**What deleting a Binder does today: nothing, because there is no delete
command.** [F] The binder commands are `createBinder`, `renameBinder`,
`setBinderArchived`, `addBinderEntry`, `removeBinderEntry`. `phase5-c34b:474`
asserts no delete may appear; `Binder.jsx:36-39` says *"There is no delete,
because the domain has none."*

**Could Keep/Delete replace Keep/Archive/Delete?** [I] The facts lost would be:
`archivedAt` ("when I put this away"), which has no other home; the binder's name
and set as a record of how it was left; and reversibility, since there is no
undelete. **The prune's archived skip is an accident, not a dependency** — the
comment I wrote there says so, and it is defended by one test. Removing Archive
would make the prune *simpler*.

**[F] The real blocker is different: today "put away" is the only way to make a
binder go away at all.** Removing Archive without adding Delete would leave a
Collector with binders they can empty but never dismiss. **[D]** Keep/Delete is
viable, but it is Archive-removal *plus* a delete command, and what delete does to
the objects filed there is a decision — trivial under object-level membership
(clear the field), destructive under card-level.

---

## 8. Browse / declaration flow

[F] Every one of the eight flows goes through a single component,
`CardSpecification`, opened from `Browse.jsx:172-182`, `Collection.jsx:314-317`
and `Binder.jsx:199-202/228-231`, and every one ends in one callback,
`onSpecify` — a 12-branch switch at `client/sign-in/SignIn.jsx:228-250`. There is
no other Collector write path in production.

Real `planFrom` output:

```
1 Primary Goal      [{"kind":"start-looking","tier":"primary","desired":{…}}]
2 Secondary Goal    [{"kind":"start-looking","tier":"secondary","desired":{…}}]
3 Owned copy, PC    [{"kind":"record-copy","copy":{…,"keeping":true}}]
4 Owned copy, T/S   [{"kind":"record-copy","copy":{…,"offered":true}}]
5 Existing copy → binder b1   [{"kind":"file","binderId":"b1"}]
6 Existing Goal → binder b1   [{"kind":"file","binderId":"b1"}]
```

**[F] Flows 5 and 6 produce a byte-identical plan.** The durable row carries no
`copyId` and no `goalId`. **A binder membership names a card, never the object
the person was looking at.**

**Flow 7 (a second owned copy) works** [F] — `addCopy` appends a draft with
`id: null`, the button "I own one of these" is always present, and two new copies
in one press emit two independent `record-copy` steps.

**Flow 8 (a second sought copy) does not exist** [F]. There is no "add another
goal" control; `answers.want` is a single scalar and `answers.desired` a single
pair; `planFrom` takes `goals.find(…)` — the first goal, singular. **Stating
different criteria silently overwrites the existing Goal.** The domain agrees:
`duplicate-goal`.

> **[I] Sought copies are modelled one-per-card. Owned copies are not. That
> asymmetry is the centre of the correction.**

**What evidence the panel has to tell "organise" from "a second one"** [F]: for
copies, exactly one bit — `draft.id` (present = edit, `null` = create). **For
goals, none at all. For filing, none** — the binder checkbox list toggles a `Set`
of binder ids against a card-level `filedNow`, and there is nothing on a copy row
or the goal block to say which object is being filed, because the durable row
cannot hold it.

**[F] Production reachability: all twelve commands the panel can send are
exposed.** Flows 1–7 are fully production-reachable. Flow 8 is not blocked by
exposure — it has no UI and the domain refuses it. Nothing here is demo-only.

**[F] The `draftKey` defect.** `draftKey` is written onto the `record-copy` step
at `CardSpecification.jsx:199` and read by **nothing** (one occurrence
repo-wide). After a partial commit the panel re-creates the copy:

```
press 1: ["record-copy","file"]   // record-copy succeeds, file fails
press 2: ["record-copy","file"]   // same answers, server already holds cp9
```

The panel's own text says *"pressing Save again sends only what is left."* It
sends a duplicate physical copy. **[I] Same missing evidence as flows 7 and 8:
the client has no handle on the object it just made.**

---

## 9. True Match and Trusted Partner interaction

**Demand path** [F]. A discovery row carries `{key, goalId, collectorId,
partnerId, canonicalCardId, tier, invIds[], copies}`. Dropped: `goal.desired` and
every copy fact. `meetsGoalCriteria(desired, copy)` is asked **per concrete
inventory copy**, exact string equality after trim, unstated dimensions
unrestricted; `startOpportunity` re-asks the identical predicate, so surface and
command cannot drift.

**The Collector does see which specific shop copy matched** [F] —
`DealFlow.jsx:118-124, 200-204` rehydrates each `invId` against `state.inventory`
and renders one row per physical copy with shop, grade line, cert, photo note and
ask, plus per-copy Inspect and Request-photos buttons. The other two consumers
are count-only: `Goals.jsx:219` ("Northline has 2 of this card") and
`TrustedPartners.jsx:158,179`.

**Supply path** [F]. `COLLECTOR_COPY_FOR_PARTNER` = `[id, collectorId, cardId,
canonicalCardId, grade, condition, offered, photos, cert, addedAt, updatedAt]` —
`market` and `keeping` excluded. Membership is `inSupply` (in network **and**
`offered === true`) **or** `referenced` (on a submitted trade row of this
partner's opportunity).

> **[F] Per-copy identity crosses the boundary with grade, condition, cert and
> photos — and there is no TP surface that lists it.** The only consumer of
> `state.collectorCopies` anywhere under `client/tp/` is `CollectorNetwork.jsx:170`,
> used solely to print `offeredCopies.length`. `Inventory.jsx` and
> `Opportunities.jsx` never reference `collectorCopies`; `Opportunities.jsx` never
> reads `o.trade.cards` either.

**What a TP-side Collector Demand view would require** [F]: already present —
`GOAL_FOR_PARTNER` includes `id`, `collectorId`, `canonicalCardId`, `tier`, `note`
**and `desired`**, scoped to the accepted network, and `CollectorNetwork.jsx:553-596`
already renders one row per goal with `desiredLine(g.desired)`; a partner's own
opportunities carry `goalId`, so "already being worked" is derivable. Not
present: no cross-collector index of goals, no TP-side goal→discovery join that
keeps `invIds`, no per-goal count, no signal of whether a goal has been acted on.
**[I] The data exists in the projection; only the surface is missing.** Nothing
was designed or built.

---

## 10. Qualification and transaction identity trace

[F] Probe transcript, ids present in the durable record after each transition:

| Step | Goal id | TP copy id | CollectorCopy id(s) |
|---|---|---|---|
| Goal → discovery | `g1` | `invIds:["i1"]` | — |
| `reviewCopy` | **none** | `invId:"i1"` | — |
| `requestPhotos` | **none** | `invId:"i1"` | — |
| `addCopyPhotos` | **none** | `invId:"i1"` | — |
| `startOpportunity` | `goalId:"g1"` | `invId:"i1"` | — |
| `proposePrice` / `acceptPrice` | `g1` | `i1` | — |
| `proposeTradeSelection` | `g1` | `i1` | `binderId` per trade row |
| `reviewTradeCard` … `confirmHandoff` | `g1` | `i1` | retained |

**Where the question stops being answerable** [F]:

| Point | Lost or merely unrendered |
|---|---|
| **Qualification is goal-blind.** `reviewCopy`/`requestPhotos` store no `goalId` | **Genuinely lost** — two Goals for one card produce byte-identical, unattributable review rows |
| **Trade rows carry no grade/condition** (`emptyTradeCard`) | Recoverable while the copy row survives; **lost** if the copy is later removed or its grade corrected — the row is a live pointer, not a snapshot |
| **Goal criteria are mutable mid-deal.** `updateGoalCriteria` has **no `goalLocked` guard**, unlike `updateGoalTier`/`removeGoal` | **Genuinely lost.** Probed: with a live opportunity, `updateGoalCriteria` OK while `removeGoal` and `updateGoalTier` both refuse `goal-locked`; afterwards `meetsGoalCriteria(new desired, i1) = false`. **The deal's own admission gate can no longer be reproduced from stored state** |
| **After completion the Goal can be deleted**, dangling `opp.goalId` | **Genuinely lost** — only `canonicalCardId` survives on the Opportunity |
| TP "Ready to coordinate" renders `d.copies` | Merely not rendered |
| TP cannot see any offered copy individually | Merely not rendered |

**[F] Exposure.** Of this whole path, the exposed commands are `reviewCopy`,
`endReview`, `requestPhotos`, `addCopyPhotos` and `updateGoalCriteria`. Every
transaction command — `startOpportunity` through `confirmHandoff`, plus
`setCopyPending` and `sendMessage` — is **domain-only**.

**[I] Consequence worth stating plainly: `updateGoalCriteria` is exposed, so the
criteria-rewritten-mid-deal gap becomes reachable the day `startOpportunity`
ships, not the day the trade surface does.**

---

## 11. Persistence and migration consequences

**What production actually contains** [F]:

- `server/bootstrap.js:11-15` — *"No demo seed, no example cards, no placeholder
  shop, no invented collector, no history. Production begins with nothing, and
  the first real records are created by real people through commands."*
- `0011:22-25` — the legacy `catalog_cards` table *"is empty in production, so a
  Collector could not record owning anything at all"* until that migration.
- `0009:19-22` says the same for opportunities.
- Demo/prototype data is a separate deployment (`demo.metyet.io`) and
  `bootstrap.js` cannot reach it.

**[F] I did not read a production database and did not ask for credentials**, so
the live row counts are unknown from the repository. What is knowable is the
*shape* of the problem.

**Can an existing card-level binder entry be deterministically assigned to a Goal
or a copy?** [I], stated as a rule rather than an answer:

| Card's state at migration time | Deterministic target? |
|---|---|
| exactly one Goal, no copies | **yes** — the Goal |
| exactly one copy, no Goal | **yes** — that copy |
| a Goal **and** one or more copies | **no** — ambiguous |
| several copies | **no** — ambiguous |
| neither (legacy stateless entry) | **no target exists** |

**[I] The ambiguous cases cannot be resolved without inventing an answer, and
this audit does not.** Three honest options exist and all are **[D]**: assign
where deterministic and drop the rest; assign where deterministic and leave the
rest as card-level rows in a transitional shape; or ask the Collector. The first
is only acceptable if the measured count of ambiguous rows is small — and that
count must be taken from the live database before any migration is written.

**What a migration would touch** [I]: add `binder_id` to `goals` and
`collector_copies` (or leave it in `attrs` and add nothing); backfill from
`binder_entries` by the rule above; drop `binder_entries`, its unique index and
its FK to `metyet_catalog.canonical_cards`; update `world-repository.js:110-111`.
`0012`'s lesson applies directly: **an absent `attrs` key is `undefined`, and
`undefined` silently doing the work of a real value is how a Collector lost their
visible supply.** A nullable `binderId` meaning "no home" must be distinguishable
from "not yet migrated", or it will repeat that failure exactly.

---

## 12. Candidate branch disposition

Branch `phase-5-four-state` = `f43d946` + `5931dbb` on `64f88e1`.
Code diff: 34 files, +2,257 / −217. Verdicts are **[I]**, evidence **[F]**.

| Item | Verdict | Why |
|---|---|---|
| Positive `keeping` on a copy | **keep as-is** | It is a fact about a specific owned copy — exactly the corrected model. No migration; `attrs`-resident |
| `withDisposition` (absence, never `keeping: false`) | **keep as-is** | Object-level, correct, and the 0012 lesson made explicit |
| Copy-level mutual exclusion (two doors, each clears the other) | **keep as-is** | Per-copy, which is the point |
| `setCollectorCopyKept` exposure (22 → 23) | **keep as-is** | |
| `collectorStatesFor` | **keep concept, rewrite implementation** | The four-state vocabulary survives; its *card-level signature* does not. Under object membership the question is "what is this object", answered by the object's own `tier` or disposition |
| `cardHasState` | **discard before merge** | Both callers disappear |
| `addBinderEntry` no-state guard + `REFUSE.cardHasNoState` | **discard before merge** | Replaced by resolving the object the membership names |
| `pruneOrphanedMemberships` | **discard before merge** | Removing an object takes its home with it — an ordinary cascade. The residue (may an undisposed copy stay filed?) becomes a one-line field clear, if the product wants it at all |
| Command-plan ordering (state before filing; withdrawals last) | **keep concept, rewrite implementation** | The *principle* — never write a membership that the next command invalidates — is right and was learned the hard way. The specific ordering exists only because the prune exists; an UPDATE-based home removes the hazard |
| Destruction warnings (panel + Goals screen) | **keep concept, rewrite implementation** | The principle (never destroy curation silently) holds. The claim becomes smaller and truer: "this copy's place in *Shoebox* goes with it", not "the card comes out of all 3 binders" |
| Offered / Keeping / nothing presentation | **keep as-is** | Per-copy and honest; ends the "Not offered" conflation |
| Partner allow-list (`keeping` excluded) | **keep as-is — but see §15.1** | The field-level rule is right. My claim that the protection was *doubled* was wrong |
| Truth-telling cleanup A–F | **keep as-is** | Independent of the object model |
| `tests/…four-state-and-binder-invariant.cjs` §A, §B, §E | **keep as-is** | About the four states, mutual exclusion, privacy and the boundaries |
| §C (lines 286-563, tests 16–25 incl. 21b–21f) | **discard before merge** | Written to defend the guard and the prune |
| §D (564-727, incl. `[28b]`) | **keep concept, rewrite implementation** | `[28b]`'s *method* — run the real plan against the real domain — is the most valuable thing in the suite and must survive whatever replaces it |
| §D2 | **split** — `[30]`, `[31]`, `[34]` keep as-is; `[32]`, `[33]`, `[33b]`, `[33c]` rewrite | The first three are about `keeping` itself; the rest are about the guard and the cascade |
| 13 re-pinned tests in c31/c32/c33/c34a/c34b/cross-views | **keep concept, re-pin again** | Several were re-pinned *away* from assertions that object-level membership makes true again — e.g. c31 E, "the last owned copy leaving does not un-file the card" |

**[I] Overall: roughly 60% of the branch is unaffected by the correction and
should merge; the Binder machinery — one predicate, one guard, one refusal code,
one cascade and ~280 lines of test — should not.** The branch is not wasted work;
its card-level half is the part the correction was written to remove.

---

## 13. Adversarial scenario results

**1. Four owned copies, two purposes.** [F] Domain and Collector projection:
**pass** — four distinguishable rows, correct dispositions, correct per-copy
status. Partner projection: **pass** — three rows, A absent, no `keeping`, no
`market`. TP surface: **fail** — `"Copies offered: 3"`. Binder: **fail** — one
membership; `Collection.jsx:288` renders zero copy rows inside a binder by design.

**2. Own one, hunt another.** [F] **Pass in the domain, fail in organisation.** A
PSA 9 PC copy and a Primary PSA 10 Goal coexist; `meetsGoalCriteria` correctly
matches only PSA 10 inventory; `collectorStatesFor` returns `["pc","primary"]`.
But both objects share one binder membership, and `Collection.jsx:181,205` renders
the card once.

**3. Three trade copies.** [F] **Binder: no** — one row, and copies are
deliberately suppressed there. **Downstream TP: no** — a count. **Inside a deal:
yes** — B, C and D are reviewed, valued and committed independently by id, though
the trade row carries no grade or condition, so any surface must re-join to say
"the PSA 9" versus "the Raw NM".

**4. Same card, different sought criteria.** [F] **Refused today**, by
`duplicate-goal` and by the unique index; the panel silently overwrites instead.
[I] Consequences of changing it: **one** DB constraint to drop
(`goals_one_per_collector_card_idx`); **one** domain line; **three** sites that
would silently pick the wrong Goal (`Collection.jsx:142-146` last-write-wins,
`CardSpecification.jsx:117,264` first-wins — the panel would diff a *different*
goal than it rendered, writing one Collector's PSA-10 criteria over their Raw
goal); **five** card-level `Set`s that render one row per card. Discovery,
`validateWorld`, the projection, `goalLocked` and `oneNegotiationPerGoal` all need
**nothing** — probed: two goals, two independent concurrent deals, world valid.

**5. Duplicate-looking add.** [F] Works today and is production-reachable: the
"I own one of these" button is always present, and a new draft (`id: null`)
produces a `record-copy`. **The evidence distinguishing "organise what I have"
from "I own another" is exactly one bit — `draft.id`** — and it exists only for
copies. For goals there is none; for filing there is none. [I] The minimum extra
evidence, naming only: a durable identity for a sought copy carried in the
answers; a client handle binding a new draft to the row the server minted (the
dead `draftKey`); an object reference on a membership; a count rather than a
boolean in Browse; and an entry point that can open the panel **on an object**
rather than only on a `canonicalCardId`.

**6. Binder deletion** (one Goal, one PC copy, three Trade/Sell copies). [F]
**There is no delete command**, so nothing survives or fails — the scenario is
unreachable. Archiving the binder changes nothing about the objects.
[I] Under object-level membership, delete is `binderId = null` on the five
objects and the binder row goes; every Goal and copy survives untouched, which is
what "organisation, not ownership" has to mean.

---

## 14. Recommended target model

Only as specific as the evidence supports. All **[I]**, with **[D]** marked.

```
canonical card    reference data. Answers "which card is this?" Never owned,
                  never organised, never actionable.

Goal              THE SPECIFIC SOUGHT COPY. Already is one. Keep the noun.
                  id · collector · canonical card · desired (exact) · tier
                  · lifecycle · binderId?

CollectorCopy     THE SPECIFIC OWNED PHYSICAL COPY. Already is one.
                  id · collector · canonical card · grade · condition · cert
                  · photos · market · offered | keeping · binderId?

Binder            a name and a set. Membership is a FIELD ON THE OBJECT,
                  not a join table and not a new noun.
```

**What this deletes:** the `binder_entries` table and its index and FK;
`cardHasState`; the `addBinderEntry` guard and `REFUSE.cardHasNoState`;
`pruneOrphanedMemberships` and its four call sites; the `file`-before-`unfile`
ordering constraint and the withdrawals-last constraint; `validateWorld`'s
membership duplicate check; ~280 lines of test.

**What this adds:** one nullable field on two rows, one `ref` + owner-match rule
in `validateWorld`, and one setter per object (or one `fileObject`).

**What it does not touch:** discovery, `meetsGoalCriteria`, the Opportunity, the
negotiation locks, the partner allow-lists, the four-state vocabulary, and every
`interests`/`opportunity_trade_refs` `binderId` site.

**Explicitly rejected** [I]: a `CollectorCard` / `CardInstance` / `CollectingObject`
wrapper. The repository proves the two nouns already exist, already carry stable
ids, and are already what every derivation keys on. A wrapper would duplicate the
Goal's id, criteria, tier and lifecycle and orphan `opportunities.goal_id`.

**Not recommended and not needed** [I]: a polymorphic `binder_memberships` table.
It reintroduces a row with no natural owner, and it is the shape that forced
`pruneOrphanedMemberships` to exist.

---

## 15. Product decisions still required

**Two are contradictions to resolve before anything is built, not preferences.**

1. **`proposeTradeSelection` admits a PC copy.** [F] It checks existence,
   ownership, photographs and reserved/committed status; it never reads `offered`
   or `keeping`. The kept copy then crosses to the partner with grade, cert and
   both photographs, labelled `"reserved"`, and may be accepted to `"traded"`.
   `setInterest` guards this correctly; `proposeTradeSelection` does not.
   **[D]** Is a kept copy admissible to a package a person explicitly assembles,
   or is PC a hard bar? Either answer is defensible; the current state is that the
   question was never asked, and the four-state hand-back claimed a protection
   that is not there.
2. **`updateGoalCriteria` has no `goal-locked` guard.** [F] Criteria can be
   rewritten while a deal is live. **[D]** Should the criteria be locked while a
   deal names the Goal, or snapshotted onto the Opportunity at
   `startOpportunity`? Locking is one line and matches `updateGoalTier`;
   snapshotting is more faithful but adds a durable field.

**Then the object-model decisions:**

3. **May a Collector hold more than one sought copy of one canonical card?**
   The correction does not require it; §13.4 prices it.
4. **Must an actionable object have a binder home, or may it be unfiled?** The
   code permits unfiled today and says so deliberately.
5. **May two objects of one card sit in the same binder?** The hypothesis says
   yes; today it is unrepresentable.
6. **Does a card-level "filed" idea survive for display** (Browse's "already in a
   binder", `Collection.jsx`'s grouping), or does organisation become per object
   on screen too? This is the `Collection.jsx:288` policy — *"a binder is curation
   and must not quietly become inventory"* — which the corrected model reverses.
7. **When an object is removed, its home goes with it.** That is the same
   outcome 0013 forbade and the cascade already imposes. Confirm it is intended.
8. **Archive:** keep, or replace with Keep/Delete — which requires adding a
   delete command and deciding what delete does to filed objects.
9. **Legacy card-level memberships:** assign where deterministic and drop the
   ambiguous, leave them transitional, or ask the Collector.
10. **`binder_entries.addedAt`** — keep "when it was filed" as a field on the
    object, or lose it.

---

## 16. Smallest safe implementation sequence, if approved

Stated as a sequence, not a plan to execute. Each step is independently
shippable and independently revertable.

0. **Measure first.** Count, in the live database: Collectors; Goals;
   CollectorCopies; binders; binder entries; and entries by the §11 determinism
   classes. Everything below is sized by that count, and no migration should be
   written before it exists.
1. **Close the two contradictions** (§15.1, §15.2). Domain-only, no schema, no UI,
   no object-model dependency. Do this whether or not the rest proceeds.
2. **Fix `draftKey`** — echo the minted id back so a retry edits instead of
   duplicating. One production defect, independent of everything else.
3. **Merge the four-state branch minus its Binder machinery** — `keeping`,
   `withDisposition`, mutual exclusion, the exposure, the presentation and the
   truth-telling cleanup, with `cardHasState`, the guard, the cascade and §C of
   the suite removed. This is the "keep as-is" column of §12 and it stands on its
   own.
4. **Add `binderId` to CollectorCopy only**, alongside the existing entries, with
   `validateWorld` accepting both. Copies are the easier half: they already have
   stable ids and a per-copy UI.
5. **Add `binderId` to Goal**, same shape.
6. **Migrate and drop `binder_entries`**, by the decision taken in §15.9.
7. **Only then** touch cardinality (§15.3) if the product wants two sought copies
   of one card — it is a separate change and should not ride along.

---

## 17. Risks and rollback

- **The biggest risk is doing this after transaction work, not before.** [F] Every
  transaction command is unexposed today and `client/` contains zero references to
  them. The identity boundary is therefore still free to move. Once a trade
  surface ships, `opportunity_trade_refs` and the trade package acquire real rows
  that name copies, and the two contradictions in §15 become live rather than
  latent.
- **The `attrs` hazard, twice learned.** [F] Migration 0012 exists because an
  absent `attrs` key read as a decision and destroyed a Collector's visible
  supply. A nullable `binderId` in `attrs` has exactly that shape. Mitigation:
  make "no home" and "not yet migrated" distinguishable, or use a real column.
- **`validateWorld` is where this repository has failed three times.** [F] Adding
  a rule existing worlds violate turns the next command into a 500 rather than a
  refusal. Any new membership rule belongs at the command boundary until every
  stored world satisfies it.
- **Rollback.** Steps 1–3 are ordinary reverts. Steps 4–5 are additive — the new
  field is ignorable and `binder_entries` still holds the truth, so rollback is a
  revert with no data loss. **Step 6 is the one-way door**: once `binder_entries`
  is dropped, card-level membership is unrecoverable for any row that was
  ambiguous. Mitigation: keep the table, unread, for one release.
- **What this audit could not verify.** [F] No production database was read and
  no credentials were requested; live row counts, and therefore migration risk,
  are unknown. `conversations.card_id` is still legacy-only with no migration
  path, which is a separate foundational gap surfaced here and not solved.

---

## 18. Files, symbols and tests inspected

**Persistence:** `migrations/0001_canonical_world.sql`, `0006`, `0008_goal_canonical_card.sql`,
`0009_opportunity_canonical_card.sql`, `0010`, `0011_collector_copies.sql`,
`0012_collector_copy_offered_backfill.sql`, `0013_binders.sql`;
`world-repository.js`; `catalog-repository.js`; `errors.js`.

**Domain:** `metyet-world.js` (`validateWorld`, REQUIRED/OPTIONAL_COLLECTIONS);
`metyet-domain.js` (`collectorStatesFor`, `cardHasState`, `copyKept`,
`copyOffered`, `copyDisposition`, `meetsGoalCriteria`, `collectorCopyStatus`,
`inventoryCopyStatus`, `goalLocked`, `goalNamedByActive`, `emptyTradeCard`,
`receiptForOpportunity`, `threadKey`); `metyet-commands.js` (`addGoal`,
`updateGoalTier`, `updateGoalCriteria`, `removeGoal`, `addCollectorCopy`,
`updateCollectorCopy`, `setCollectorCopyOffered`, `setCollectorCopyKept`,
`removeCollectorCopy`, `withDisposition`, `pruneOrphanedMemberships`,
`createBinder`, `renameBinder`, `setBinderArchived`, `addBinderEntry`,
`removeBinderEntry`, `setInterest`, `reviewCopy`, `endReview`, `requestPhotos`,
`addCopyPhotos`, `startOpportunity`, `proposeTradeSelection`, `reviewTradeCard`);
`metyet-discovery.js` (`discoveryKey`, `byCard`); `metyet-projection.js`
(`projectForActor`, `GOAL_FOR_PARTNER`, `COLLECTOR_COPY_FOR_PARTNER`,
`INVENTORY_FOR_COLLECTOR`, `inSupply`, `referencedCopies`, `copyForViewer`);
`metyet-store.js`; `metyet-entities.js`; `collector-view.js`; `README.md`.

**Server:** `bootstrap.js`, `exposed-commands.js`.

**Client:** `commands.js`; `sign-in/SignIn.jsx` (`onSpecify`);
`collector/CardSpecification.jsx` (`planFrom`, `initialAnswers`, `asDraft`,
`BLANK_COPY`, `explain`); `collector/sections/Browse.jsx`, `Collection.jsx`
(`groupIdOf`, `copiesOfCard`, `cardKeys`, `touchedAt`, `withCopies`),
`Binder.jsx` (`cardsIn`, `countOf`, `filedSomewhereActive`), `Goals.jsx`
(`filedIn`, `otherState`, `bindersLost`), `DealFlow.jsx`, `TrustedPartners.jsx`;
`collector/CollectorShell.jsx`; `production-app.jsx`; `tp/sections/CollectorNetwork.jsx`,
`Opportunities.jsx`, `Inventory.jsx`; `tp/present.js`.

**Tests:** `phase5-four-state-and-binder-invariant.cjs` (1,048 lines, sections
A–E); `phase5-c31-binder-foundation.cjs`; `phase5-c32-goal-criteria-grading.cjs`;
`phase5-c33-card-specification.cjs`; `phase5-c34a-your-cards.cjs`;
`phase5-c34b-binder.cjs`; `phase5-binders-cross-views.cjs`;
`phase3-domain-readiness.cjs`; `fixture-store.cjs`.

**Method.** Five parallel read-only tracers, each driving the real domain with
hand-built worlds through `tests/fixture-store.cjs`, and bundling client modules
in memory to call `planFrom`/`initialAnswers` directly. Every load-bearing claim
above was produced by running the code, not by reading its comments — which
matters here, because several comments state positions the code no longer holds.

---

## 19. Repository state

| | |
|---|---|
| **Merged baseline** | `64f88e1` (merge PR #78) |
| **Candidate work audited** | `f43d946` + `5931dbb` on branch `phase-5-four-state` — the working tree, not the bundle |
| **Worktree** | `/home/claude/s1`, `git status --porcelain` **empty before and after this audit** |
| **Migrations** | 13, latest `0013_binders.sql` — unchanged |
| **Exposed commands** | 23 of 51 domain commands — unchanged |
| **Modified by this audit** | nothing except this document |

**Stop condition observed.** Nothing implemented, no migration written, no binder
entry rewritten, Archive not removed, the four-state branch not merged, no
transaction command exposed, no TP Inventory built, no PC view created, no UX
reconciliation begun. The two foundational contradictions found (§15.1, §15.2)
are surfaced, not solved.
