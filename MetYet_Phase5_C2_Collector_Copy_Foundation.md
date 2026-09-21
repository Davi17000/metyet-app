# MetYet — Phase 5 C2: Collector Copy Foundation

**Status: PASS.** `npm run verify` exits 0. 121 suites, 3,946 assertions, production build 341,147 bytes, smoke 83,686 characters.

---

## The sentence this batch had to make true

> MetYet has one clear, canonical, production-capable concept for a Collector-owned physical card, and whether that card is offered for Sell / Trade can change without changing whether the Collector owns it.

It is true. Two sentences that had to stay false still are: there are no named organisational Binders, and there is no Binder + Intent Browse experience. A test asserts both (`I. the concepts C3 owns do not exist yet`) by reading the command table and the navigation module rather than grepping prose, so a comment explaining what a Binder *will be* does not trip it and a real one would.

---

## 1. Baseline commit

`a0aa58d` — *Merge pull request #64 from Davi17000/phase-5-c1-catalog-browse-imported*, which is C1 merged. Baseline verify at that commit: EXIT 0, 3,893 assertions, prod build 339,297 bytes, smoke 83,686 characters.

## 2. Branch and commit

Branch `phase-5-c2-collector-copy`, worktree `/home/claude/c2`.

Commit `4095a95` — *Phase 5 C2: Collector Copy foundation — owning and offering are two facts*.

**The PR is not merged**, per the brief.

## 3. Files changed

86 files, +2,152 / −516.

| Area | Files | Lines |
|---|---:|---|
| `domain/` | 8 | +481 / −124 |
| `tests/` | 67 | +1,379 / −329 |
| `client/` | 4 | +118 / −36 |
| `persistence/` | 2 | +118 / −5 |
| `server/` | 2 | +19 / −2 |
| `src/`, `collector/`, `harness/` (prototype) | 3 | +37 / −20 |

The test number is large and almost all of it is mechanical: 51 suites carried a `binder` fixture key or called a `*BinderCopy` action. Seven assertions were *superseded* rather than renamed, and each is listed in §14 with the three-part explanation the brief requires.

One new file of substance: `tests/phase5-c2-collector-copy.cjs`, 51 tests across sections A–I.

One file renamed: `client/collector/sections/TradeBinder.jsx` → `MyCards.jsx` (git records it as a rename).

## 4. Persistence / migration changes

**`persistence/migrations/0011_collector_copies.sql`**, and nothing else touches a table.

```sql
alter table metyet.binder_copies rename to collector_copies;
alter table metyet.collector_copies add column canonical_card_id text;
alter table metyet.collector_copies add constraint collector_copies_canonical_card_fk
  foreign key (canonical_card_id) references metyet_catalog.canonical_cards (canonical_card_id)
  deferrable initially deferred;
alter table metyet.collector_copies alter column card_id drop not null;
create index collector_copies_canonical_card_idx on metyet.collector_copies (canonical_card_id);
```

Plus one consequence, which is not a fourth change but the first three working — see §13:

```sql
alter table metyet.opportunity_trade_refs add column canonical_card_id text;
alter table metyet.opportunity_trade_refs add constraint opportunity_trade_refs_canonical_card_fk
  foreign key (canonical_card_id) references metyet_catalog.canonical_cards (canonical_card_id)
  deferrable initially deferred;
alter table metyet.opportunity_trade_refs alter column card_id drop not null;
create index opportunity_trade_refs_canonical_card_idx
  on metyet.opportunity_trade_refs (canonical_card_id);
```

Every statement is additive or a rename. Foreign keys follow a renamed table automatically, so `interests.binder_id` and `opportunity_trade_refs.binder_id` point at exactly the rows they always did — no data moved.

**`offered` has no column.** It is a fact about the record and lives in `attrs` with every other copy fact. The reason is written into the migration header: there is already a *status* on a copy — available / reserved / committed / traded — and it is **derived** from the opportunities. Putting a stored `offered` column next to a derived status invites somebody to write the derived one down too. Nothing is backfilled in SQL; the world repository gives existing rows their value when it next writes them, and the domain decides what that value is.

Migration verification is not a separate step here: every `persistence` and `phase5-*` suite runs `migrate(db)` against a fresh PGlite instance before each test, so the migration is executed several hundred times per verify and every subsequent assertion is made against the schema it produced.

## 5. BinderCopy → CollectorCopy naming changes

| Was | Is |
|---|---|
| `metyet.binder_copies` (table) | `metyet.collector_copies` |
| `state.binder` (collection) | `state.collectorCopies` |
| `addBinderCopy` / `updateBinderCopy` / `removeBinderCopy` | `addCollectorCopy` / `updateCollectorCopy` / `removeCollectorCopy` (+ `setCollectorCopyOffered`) |
| `BINDER_FOR_PARTNER` | `COLLECTOR_COPY_FOR_PARTNER` |
| `binderCopyStatus`, `binderCopyForOwner`, `binderCopyForPartner`, `binderCopiesForPartner`, `binderCopiesInterestedBy` | `collectorCopy*` / `collectorCopies*` |
| `INVARIANTS.binderCopyPhotographed` | merged into `INVARIANTS.copyPhotographed` |
| `myBinder()`, `binderCopyState()` (prototype view) | `myCopies()`, `collectorCopyState()` |
| Collector section "Trade Binder" | "Your Cards" (`MyCards.jsx`, section id `my-cards`) |

The old command names are asserted **absent** from the domain, not merely unexposed — two names for one concept is the thing this batch exists to remove.

### Naming debt, kept on purpose and written down

These still say "binder" and each names a collector copy. Renaming them touches the interest model and the trade package, which is the trade batch's work, not this one's. They are in `domain/README.md` under a heading of their own, so nobody has to rediscover them:

| Where | What it is |
|---|---|
| `interests.binder_id` (column and field) | the collector copy a partner registered interest in |
| `opportunity_trade_refs.binder_id` (column) | the collector copy a trade row names |
| `binderId` on a trade card, `binderIds` on `proposeTradeSelection` | the same, in the domain |
| `relationships.binderReviewedAt`, `markBinderReviewed` | when a partner last opened a Collector's cards |

The prototype keeps a few UI-surface names (`AddBinderCopyModal`, the `binder` icon, the `trade-binder` CSS class). Those name screens and pictures, not the concept.

## 6. Canonical identity behaviour

A copy names **exactly one** card: `canonicalCardId` XOR `cardId`. The rule is enforced in three places, on purpose:

- **the command** — `addCollectorCopy` refuses a payload naming both, and refuses a legacy `cardId` that is not in the catalogue;
- **the server** — the catalog guard in `server/app.js`, which covered `addInventoryCopy` and `addGoal`, now covers `addCollectorCopy`. A card that is missing or withdrawn is refused as `card-unavailable`, in the caller's own vocabulary, rather than surfacing as a foreign-key error. A copy already recorded is never revisited, so a card withdrawn from the catalogue later does not take somebody's cards off their own shelf;
- **`validateWorld`** — `ref.ambiguous` for both, `ref.missing` for neither, on every load and before every save.

No provider id is durable identity anywhere in this. The grading company is not a canonical-card dimension (§10).

## 7. `offered` semantics

`offered` is a boolean on the copy: **the owner's willingness to part with it**. It is not a status, not a stage and not derived.

- **New copies default to `offered: false`.** Owning is the base fact; parting with a card is a decision, and a decision nobody made is not one to assume.
- **Rows that existed before C2 are offered**, because creating one is what offering used to mean.
- **Supply is offered supply.** `projectForActor` gives a Trusted Partner a Collector's copy only when `offered === true` — in addition to the network and status rules that were always there. An unoffered copy no partner has named reaches nobody at all: `copyForViewer` returns null and a null is dropped.
- **`setInterest` refuses an unoffered copy**, with `not-found` — the same answer a copy that does not exist gets. A refusal that told the two apart would be the leak.
- **`offered` cannot ride in on an update patch.** `updateCollectorCopy` refuses it with `identity-immutable`, so a screen editing a certificate can never change what a card is doing in the world. Willingness has exactly one door.
- **Setting it to what it already is** is a no-op that returns success and writes nothing — proved byte-identical.
- **It is a boolean or it is refused**, at the command and again in `validateWorld` (`field.invalid`).

The owner always sees their own copies whole — offered or not, including `market`, which no partner ever receives.

## 8. Stop-offering vs deletion

They are different acts with different results, and the tests assert the difference directly.

| | withdraw the offer | remove the copy |
|---|---|---|
| command | `setCollectorCopyOffered(copyId, false)` | `removeCollectorCopy(copyId)` |
| means | "I still own this, I'm not trading it" | "I don't own this any more" |
| the record | stays, with card, grade, cert, photos, `market` | gone |
| interests in it | **kept** — who had been interested is still true | cascaded away |
| a live deal holding it | unaffected | **refused** |

Every transaction protection survives unchanged: `copy-reserved` while a submitted package holds it, `copy-committed` once a partner has accepted it into a trade, `copy-committed` again after completion (history is not deletable), and `copy-in-use` for any copy an opportunity has ever named. A test walks a real negotiation — `startOpportunity` → `acceptPrice` → `proposeTradeSelection` → `reviewTradeCard` — and asserts each refusal at the stage that produces it, including that withdrawing the *offer* is still allowed at every one of those stages and changes nothing about the deal's hold on the copy.

## 9. Photo-enforcement change

The requirement did not weaken. It moved to where it bites.

It used to live at the door: `addBinderCopy` refused a copy without both faces. That put an **evaluation** rule in front of an **ownership** fact, and it cost the product the very thing the rule was for — a Collector with a shoebox and no lightbox could record nothing, so there was nothing to photograph later and no prompt to do it.

It now lives in **`proposeTradeSelection`**, which is the first moment a specific physical copy is handed to somebody else to put a value on. That is the same standard `startOpportunity` already applies to the partner's copy on the other side of the deal, so both halves of a trade are now held to one rule at one kind of moment.

`INVARIANTS.binderCopyPhotographed` is **gone**, merged into `INVARIANTS.copyPhotographed`. They were the same expression under two names, one per seat, which is how a rule starts drifting from itself; the standard does not depend on who owns the card, so neither does the predicate.

One consequential follow-on: `collectorView.tradeGroups` — the prototype's "which of my copies can I put into this trade" list — now applies the same predicate, because offering a button that the command will refuse is worse than not offering it. `offered` is deliberately **not** a filter there: broadcasting a card to your whole network and putting it into one deal with one partner are different acts, and the command draws the same line.

## 10. Grade / condition representation — decision and tradeoff

**Decision: the stored shape is unchanged in C2. A provider-neutral reader was added instead.** This is the "stop and report the tradeoff" path the brief offers, and here is the tradeoff.

`grade` is stored as a string — `"Raw"`, or a label like `"PSA 9"` — inside `attrs`; there is no column. Splitting it into `gradingState` / `grader` / numeric `grade` would touch: every inventory row already written and every collector-copy row, in two `attrs` blobs; `identityFrom`, which is the prototype's card-identity vocabulary; the prototype's card picker; and both `client/*/present.js` presenters. That is a live-data migration and a cross-seat vocabulary change, in a batch whose subject is ownership. It materially enlarges C2 and it is not safe to do quietly.

What went in instead is **`D.gradingOf(copy)`**, which parses the stored string into exactly the conceptual shape the brief describes:

```
{ grade: "PSA 9" }                        -> { state: "graded", grader: "PSA", grade: 9,   condition: null,       label: "PSA 9" }
{ grade: "Raw", condition: "Near Mint" }  -> { state: "raw",    grader: null,  grade: null, condition: "Near Mint", label: "Raw · Near Mint" }
{ condition: "Damaged" }                  -> { state: "unstated", ... }
```

Three things it buys, at the cost of one function and no migration:

1. **The grading company appears in one regex**, not in four files. Nothing outside `gradingOf` should ever test a grade string against `/psa/i` again.
2. **Stated-raw and nothing-stated stay different answers.** A copy nobody has described is not a raw copy, and the existing presenters conflated the two.
3. **The migration, when it comes, has one reader to change.** That is the whole reason to add it now rather than later.

Deliberately not done, per the brief: no BGS/CGC/SGC controls. The vocabulary the *commands* accept (`GRADED_VALUES`) is still PSA-only and still a closed list — a test asserts it did not widen. The reader can parse `BGS 9.5`; the product does not offer it. And the grader is **not** part of canonical card identity; a test asserts `identityFrom` grew no `grader` key.

## 11. Production command allow-list changes

`server/exposed-commands.js` went from six names to nine. The three added are the whole of the C2 concept:

```
addCollectorCopy            Collector → Your Cards, "I own this card"
setCollectorCopyOffered     Collector → Your Cards, offering ⇄ not offering
removeCollectorCopy         Collector → Your Cards, "I no longer own this"
```

**`updateCollectorCopy` is deliberately NOT exposed.** Editing a copy's value, certificate or photographs is a surface C2 does not build, and a command with no surface is not shipped. It is written and tested — every rule in this report about it is proved through `executeCommand`, the same transaction, the same lock and the same `validateWorld` — and it is *also* proved shut at the HTTP boundary. It joins the list in the batch that gives it a screen.

Each exposed command satisfies the brief's conditions: the server derives the actor and seat from the bearer token; a Collector may mutate only their own copies (`not-owner` otherwise, asserted in both directions); a browser cannot author an actor identity (`actor`, `seat`, and the other reserved keys are refused by the route before any command runs, and an ownership claim buried in the `copy` is ignored rather than honoured); a canonical card must exist; and every transaction lock and history constraint remains authoritative.

Two pins now record the exact list — one in the C2 suite (§H) and one in the C1 suite, restated to name C2's three so that the next batch to edit that line has to say which door it opened and why.

## 12. Projection / privacy behaviour

`COLLECTOR_COPY_FOR_PARTNER` is what a related Trusted Partner may receive:

```js
["id", "collectorId", "cardId", "canonicalCardId", "grade", "condition",
 "offered", "photos", "cert", "addedAt", "updatedAt"]
```

It is an **allow-list**, so a field nobody has classified is projected to nobody — asserted directly by smuggling an invented key into a copy and proving it does not cross.

- `canonicalCardId` joined it because it *is* the identity now: a copy whose card the viewer cannot resolve is a copy of nothing.
- `grade` and `condition` joined it for the reason they are on the inventory list: they describe the very thing being offered, and a partner who cannot see whether a copy is PSA 9 or heavily played cannot value it.
- `offered` joined it because a partner receiving the copy at all is being told it is available to them, and the field saying so should not be the one thing they must infer.
- **`market` is still not on it**, and the reason has not changed: it is what the Collector thinks the card is worth, which is their side of a negotiation. A test asserts the number itself never appears anywhere in a partner's response.

What each seat sees:

| Seat | Sees |
|---|---|
| the owner | every copy they own, offered or not, whole — including `market` and the server's derived status |
| a related partner | offered copies only, allow-listed fields, plus any copy their **own** submitted package names |
| an unrelated partner | nothing — no copies, no Collector to attach them to, not even an id |
| another Collector | nothing of somebody else's shelf |

One case worth stating precisely, because it is the seam between two rules. A copy the partner's **own** submitted package names still reaches them after its owner withdraws the offer, carrying their own deal's derived status (`reserved`, `committed`). `offered` gates **supply**; participation in a record is an older and stronger rule, and a partner who staked a negotiation on a card is never shown a hole where their own proposal used to be. They are told it is no longer offered; they are never told anything about a deal they are not in.

## 13. Trade / deal compatibility

Everything in the negotiation model is unchanged except one thing, which had to change or the batch's success condition would be false in practice.

**A trade row may now name a canonical card.** `opportunity_trade_refs.card_id` was `NOT NULL` with a foreign key into the legacy `catalog_cards`. A Collector's copy recorded in production names a *canonical* card and has no legacy one — so without this, a production copy could be owned and offered and **never actually put into a trade**. "Production-capable" would have been true in name only.

The change is the same additive move Batch 6 made for inventory, Batch 7 for goals and Batch 8 for opportunities:

- `emptyTradeCard(cardId, photos, cert, binderId, canonicalCardId)` — the canonical id is a **fifth argument**, not a replacement for the first, so every existing caller (the demo, the draft editor, ~20 fixtures) is untouched. Pass it and the row carries `canonicalCardId` and no `cardId`; omit it and nothing changes.
- `validateWorld` now requires exactly one reference on a trade row (`ref.ambiguous` / `ref.missing`), **and additionally** requires that the row names the same card as the copy it carries (`ref.mismatch`). A package pointing at one card while carrying a copy of another would let a Collector be paid for something they are not handing over; nothing checked that before.

The `binder_id` column beside it is **not** renamed, and neither is `binderId` on the trade card or `binderIds` on `proposeTradeSelection` — that is the trade batch's work, and it is written down as debt.

Everything else holds and is asserted: the stage machine, the settlement arithmetic, the derived copy status, the reservation and commitment locks, deal history, and the existing `select-trade` closeout pins.

## 14. Tests and assertion count

**3,946 assertions across 121 suites, all passing.** Baseline was 3,893; C2 adds 53 net.

New suite: **`tests/phase5-c2-collector-copy.cjs`**, 51 tests, registered in `tests/all.cjs`. Sections map onto the brief's required properties A–I one to one. It drives the product's own door — `POST /api/commands` with a bearer token — for everything the product exposes, and reaches past it only for `updateCollectorCopy`, which it also proves shut.

### Assertions intentionally superseded

Seven, each with the three-part explanation the brief requires. None was loosened; four became stricter.

**1. `shared-state` — "the photo invariant holds at the domain, not the form"**
*Protected:* that a half-photographed copy could not be created, and that the rule lived in the domain rather than in a form.
*No longer correct:* it put an evaluation rule in front of an ownership fact; a Collector who cannot photograph cannot record.
*Replaced by:* "the photo invariant is one predicate, and adding a copy is not where it bites" — the add path records the object, `copyPhotographed` is asserted strict in both directions, and `binderCopyPhotographed` is asserted **absent**. The enforcement point is proved in the C2 suite (§E), end to end through a real negotiation.

**2. `binder-edit-and-partner-profile` — "the photo invariant is reused, not weakened"**
*Protected:* that editing a copy down to one face was refused, and that the two seats shared a predicate.
*No longer correct:* same reason, and the "shared predicate" it asserted was in fact two predicates with the same body.
*Replaced by:* "the photo invariant is one predicate, still strict, and no longer at the edit door" — the edit keeps every protection that is about the *edit* (a committed copy's certificate is still frozen, a negative value still refused), the predicate is asserted strict, and the duplicate is asserted gone.

**3. `binder-and-partners-v1` — "a newly added copy becomes eligible"**
*Protected:* that an unphotographed copy could not be offered into a trade.
*No longer correct:* it asserted refusal at the *add* door.
*Replaced by:* the same test, now asserting that an unphotographed copy **is created** (you own it) and **is not offerable** — it does not appear in the trade-selection list. The rule followed the enforcement point rather than being deleted, and the test gained an assertion.

**4. `phase3-domain-readiness` — the `photos-required` row in the refusal table**
*Protected:* that a refusal writes nothing and returns no next state, exercised through `addBinderCopy` with one photo.
*No longer correct:* `addCollectorCopy` does not refuse on photos.
*Replaced by:* the same table row, now `updateCollectorCopy` with `offered` in the patch → `identity-immutable`. The property under test (a refusal changes nothing, byte for byte, and carries no state) is unchanged; the row now pins a rule C2 *added*.

**5. `phase3-domain-readiness` — "all 41 commands ran" / `COMMAND_NAMES.length === 42`**
*Protected:* that the id-and-time proofs exercise every command in the table, exactly.
*No longer correct:* the table has 43 commands.
*Replaced by:* the same assertion at 43, with the three renamed and one new command named in a comment so the number is not the only record of the change. Every name must still be exercised by the script, and the exact total is still asserted rather than compared loosely.

**6. `phase5-b6-trusted-partner-inventory` — "this batch moved inventory and nothing else"**
*Protected:* that Batch 6's migration touched one table, and that commands B6 did not own had not quietly moved to canonical identity. The list named `addCollectorCopy`.
*No longer correct:* C2 *is* the batch that moved collector copies, by its own migration — which is the point of the boundary, not a breach of it.
*Replaced by:* the same test, with `sendMessage` and `recordNote` in the list — the commands still waiting for the batch that rewrites them. The rule still bites; it now bites on what is actually pending. The migration-scope half is untouched.

**7. `phase5-c1-catalog-browse` — "no command was added to reach any of this"**
*Protected:* that C1 opened no door, pinned by the exact allow-list.
*No longer correct:* C2 opened three, on purpose.
*Replaced by:* the same exact-list assertion with C2's three named inline, **plus** a new assertion that `updateCollectorCopy` is not exposed. The load-bearing half — that the shared browser names no command — is unchanged.

Three further assertions were **renamed, not superseded**, and are listed for completeness: the deferred-section id (`binder` → `my-cards`), the section's label in the Phase 4 shell suites, and the TP network's copy-count label (`Binder copies` → `Cards offered`). The last of those also got more honest: a partner only ever receives a Collector's *offered* copies, so it was never a count of what they own.

### What the new suite caught

Two real defects, neither of which existed before the tests were written:

- **A canonical Collector copy could not enter a trade at all.** `proposeTradeSelection` built the row from `b.cardId`, which is null for a production copy, and `validateWorld` rejected the resulting world — so the command refused every submission. This is §13.
- **A trade row could name a different card from the copy it carried.** Nothing checked it. `ref.mismatch` now does.

## 15. Build and smoke results

```
npm run verify   EXIT 0
  build          dist/MetYet.cjs, dist/Collector.cjs, dist/Prototype.cjs, test bundle
  test           ALL SUITES PASSED — 121 suites, 3,946 assertions
  prod           PRODUCTION BUILD OK — bytes: 341147   (baseline 339,297; +1,850)
  smoke          PROD SMOKE OK — rendered 83686 chars
  previews       MetYetCollector.preview.jsx 7,684 lines; MetYetPrototype.preview.jsx 11,913 lines
```

## 16. Deliberately deferred to C3

- **Named organisational Binders.** No table, no command, no section, no navigation entry. The Binder Architecture Checkpoint's recommendation stands: a Binder's membership points at the **canonical card**, not at a Goal and not at a copy, which is what lets one person own a PSA 9 and want a Raw NM of the same card inside one "Mudkip Collection" without a contradictory record.
- **The Binder + Intent Browse experience.** C1 shipped catalogue and selection only, by explicit decision; nothing here revisits that.
- **The control that records a card you own.** The commands are exposed and the section is built, but the button belongs beside the card in Browse, where a Collector is already looking at it. That is why **Your Cards stays out of the navigation** — the reason changed from *impossible* (8.1: the only command needed an empty legacy catalogue) to *half-built*, and the shell's comment says so. That batch moves one entry up into `SECTIONS` and does nothing else there.
- **`updateCollectorCopy`'s production surface**, and with it the ninth-to-tenth entry on the allow-list.
- **Renaming `binder_id` in `interests` and `opportunity_trade_refs`**, `binderId` on trade cards, `binderIds` on `proposeTradeSelection`, and `markBinderReviewed` / `binderReviewedAt`. Trade-batch work; tabled in `domain/README.md`.
- **Splitting the grade string into stored `gradingState` / `grader` / numeric `grade`.** §10 has the tradeoff and the reader that makes it cheap.

## 17. Architecture concerns discovered during implementation

**A. A copy's facts are open, on both seats.** `addCollectorCopy` and `addInventoryCopy` both spread whatever the caller describes into the row, so a caller can write arbitrary keys into canonical state. It is *not* a privacy hole — the projection allow-lists mean an invented field reaches no other seat, and a test asserts exactly that — and it is deliberate to the extent that a copy's facts really are whatever its owner says. But it means canonical state can accumulate keys nobody classified, and `validateWorld` will not notice. The pattern predates C2 and narrowing it would change inventory as much as collector copies, so it is reported rather than changed. **Both halves are now asserted** in the C2 suite, so whoever narrows it has a test that says what the guarantee currently is.

**B. The prototype's `collector-view.js` and the production projection are two boundaries for one rule.** Both strip `market`; only the production one is an allow-list. The prototype's is a deny-list, so a new field there crosses by default. `domain/metyet-entities.js` now says so in the comment above those helpers. Nothing needs to change while `client/` cannot import `domain/` — a boundary test enforces that — but the two will disagree the first time somebody adds a field to a copy and only updates one.

**C. `client/` cannot use `D.gradingOf`.** The same boundary means the two `present.js` files keep their own `isGraded` / `gradeLine`, each with its own `/^raw$/i` regex. The domain now has the authoritative reader; the presenters still have copies of the decision. When the stored shape is normalised, the projection should carry the parsed shape across so the presenters read fields rather than parsing strings — otherwise there will be three readers instead of two.

**D. Migration 0011 does the rename and the FK addition in one file.** A rename is not reversible by a later `add column`, so rolling this back means writing a down-migration by hand. No migration in this repository has one; that is a standing property, not a C2 decision, but it is worth knowing before the first production deploy that carries a rename.

---

## Handoff

Branch `phase-5-c2-collector-copy`, commit `4095a95`, off `a0aa58d`. Bundle delivered separately; import with:

```
git fetch <bundle> HEAD:phase-5-c2-collector-copy-imported
```

Push from this environment still fails (the cloud proxy does not authorise this repository), so the bundle remains the handoff. **The PR is not merged.**
