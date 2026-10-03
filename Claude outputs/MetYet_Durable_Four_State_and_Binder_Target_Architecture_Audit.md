# MetYet — Durable Four-State Invariant + Binder Target Architecture Audit

Audit and design only. **Nothing was implemented.** No code, test, migration or
schema changed; nothing merged or pushed.

Labels: **[F]** repository fact · **[P]** closed product decision from this brief
· **[R]** architectural recommendation, mine and arguable.

---

## 1. Executive recommendation

The doctrine is reachable. **The order in which it is enforced decides whether it
ships or takes production down**, and one part of it has no product answer yet.

**Three findings dominate everything else.**

**1.1 — "Haven't decided" is the shipped default, so the state the doctrine
forbids is plausibly the commonest one there is.** [F] `addCollectorCopy` writes
`offered: offered === true` and writes `keeping` only when true, so a copy
created with no disposition lands as `{offered:false}` with no `keeping` key —
and the panel's `BLANK_COPY` carries `disposition: "unstated"` as the default for
every new copy. Migration 0012 backfilled `offered: true` only onto rows whose
key was *absent*; every post-C2 withdrawal and every "Haven't decided" copy since
is explicitly `offered:false` and untouched by it. No count is fabricated here —
§17 gives the query — but the illegal set is the default path, not an edge case.

**1.2 — The rule must NOT go into `validateWorld` first, and the repository says
so in its own words three times.** [F] `world-repository.js` validates on **load**
as well as before save, so a new invariant does not refuse a command — it makes
every existing world *unloadable*. `metyet-world.js:328-336`, on `keeping`:

> *"Requiring it would make every stored world invalid, which is an error raised
> on the next command anybody sends rather than a refusal."*

**[R] So the enforcement order is the reverse of the tempting one:** command
first (refuse new stateless writes), then measure, then resolve the existing
rows, and `validateWorld` **last** — only once the measurement says every stored
row already satisfies it.

**1.3 — The doctrine has no answer for "what does withdrawing a statement
mean?", and that gap blocks batch 1.** [F] Today `setCollectorCopyOffered(false)`
and `setCollectorCopyKept(false)` are the only ways to take a statement back, and
both produce exactly the stateless row the doctrine forbids. If stateless is
illegal, then either withdrawal disappears (the control becomes two-way and every
change is a *switch*), or withdrawing an offer silently means "I am keeping it" —
which is an inference about intent, and is precisely the shape of the error that
migration 0012 exists to atone for. **[P needed]** This is the one decision that
must be made before any code is written.

**The recommendation** [R]:

> **Enforce the four states at the command boundary for new writes, tolerate the
> existing stateless rows as legacy rather than inventing a disposition for them,
> and make Binder membership name a Goal or a copy — never a canonical card, and
> never as a second way to add a card.**

And on the Binder half: **[R] my previous audit's recommendation to preserve
card-only curation permanently is withdrawn.** The brief supersedes it as product
direction. The cost is real and should be stated once: a Binder will no longer be
able to hold a card the Collector neither owns nor wants, which `0013` argued for
at length. That is a capability removal, decided, not a migration detail.

---

## 2. SHA and worktree

| | |
|---|---|
| **Inspected** | `0e2cce8` (docs) on `b68b1ae`, branch `phase-5-four-state` [F] |
| **Ancestry** | `0e2cce8` ← `b68b1ae` ← `17743d5` ← `5931dbb` ← `f43d946` ← `64f88e1` |
| **Worktree** | `/home/claude/s1`, `git status --porcelain` empty before and after |
| **Changed by this audit** | nothing except this document |

---

## 3. Repository facts that conflict with the new doctrine

Stated plainly, because the brief asks for the contradictions exposed rather than
smoothed. [F] throughout.

| # | Repository says | Doctrine says |
|---|---|---|
| 1 | `metyet-domain.js:1545-1548`: *"OWNING WITHOUT A DISPOSITION REMAINS VALID AND REMAINS UNNAMED… it is not a fifth user-facing state."* | a durable copy must be PC XOR Trade/Sell |
| 2 | `CardSpecification.jsx:100-107` offers three answers, `unstated` being the default in `BLANK_COPY` | there are two |
| 3 | `metyet-world.js:328-336` refuses to require `keeping` **because doing so invalidates every stored world** | it must be required, eventually |
| 4 | `0012` refuses to invent a disposition: an explicit `false` *"is a decision its owner made and is left exactly alone"* | the stateless rows must become one of the two |
| 5 | `0013:17-19`: *"A Binder entry whose card the Collector neither wants nor owns is perfectly valid — that is curation, which is what a binder is for."* | Add-to-Binder may not create a generic durable card |
| 6 | `0013:21-33` argues membership must name the **card**, because naming a copy means selling it deletes the filing | membership must name the Goal or the copy |
| 7 | 14 tests across 7 suites assert a stateless copy is legal; **two of them call `repository.saveWorld` with one** | those become the opposite assertion |

**[R] Conflicts 1, 2, 5 and 6 are product reversals and the product has made
them. Conflicts 3, 4 and 7 are not reversals — they are the mechanics of getting
there without a 500, and they constrain the implementation order absolutely.**

---

## 4. Goal durability and state trace

[F] unless marked.

- **Tier is never absent in storage, but it is silently coerced.** `addGoal:419`
  and `updateGoalTier:430` both write
  `tier === "primary" ? "primary" : "secondary"`. Probe: `undefined`, `null`,
  `"banana"`, `"PRIMARY"`, `1`, `{}` all store **`"secondary"`**, with a 200. **A
  typo demotes a Goal silently.**
- **`validateWorld` is stricter than the writers.** `metyet-world.js:74,223-225`
  requires `tier ∈ {primary, secondary}`; absent, `null`, `"banana"` all produce
  `field.invalid`.
- **The database is weaker than both.** `0001:111` —
  `tier text generated always as (attrs ->> 'tier') stored`, nullable, no CHECK.
  A hand-written row with no tier yields NULL, which `validateWorld` then rejects
  **on load** — a 500, not a refusal.
- **"Both" is structurally impossible.** Tier is one scalar; there is no second
  field. `tier: ["primary","secondary"]` is rejected.
- **What Primary actually gates:** exactly one thing —
  `INVARIANTS.goalIsPursued` (`metyet-domain.js:855-858`), read by
  `startOpportunity:1510` → `refuse(R.notPrimary)`. `updateGoalTier:433` refuses
  **demotion only**, and only while `goalLocked` (negotiating and not
  transactionally lost). `removeGoal` and `updateGoalCriteria` use the wider
  `goalNamedByActive`.

**[R] Goal is already doctrine-compliant.** Primary XOR Secondary holds by
construction. The only gap is the silent coercion: under a doctrine that says the
state is *chosen*, `addGoal` and `updateGoalTier` should **refuse** a tier that is
neither value rather than defaulting to Secondary. That is a two-line change with
one new refusal code, and it is the cheapest item in this entire audit.

---

## 5. CollectorCopy durability and state trace

[F] All four combinations, probed:

| Combination | `validateWorld` | Production UI | Exposed command | Tests/seed only |
|---|---|---|---|---|
| offered-only | **valid** | yes — "I'd trade or sell this one" | `addCollectorCopy{offered:true}`, `setCollectorCopyOffered(true)` | no |
| keeping-only | **valid** | yes — "I'm keeping this one" | `setCollectorCopyKept(true)` | no |
| **neither** | **valid** | **yes — and it is the DEFAULT** | `addCollectorCopy` with no disposition; `setCollectorCopyOffered(false)`; `setCollectorCopyKept(false)` | **no — fully reachable** |
| both | **invalid** (`field.invalid`) | unreachable (one radio group) | refused `disposition-conflict` | hand-built worlds only |

**The exact line** (`metyet-commands.js:936-938`):

```js
const row = { ...facts, id, collectorId: a.collectorId, offered: offered === true,
  ...(keeping === true ? { keeping: true } : {}),
  ...(addedAt ? { addedAt } : {}) };
```

**Migration 0012, in full** [F]:

```sql
update metyet.collector_copies set attrs = attrs || '{"offered": true}'::jsonb
 where attrs -> 'offered' is null;
```

Its reasoning (`0012:16-30`): before C2 a copy existed *only* because it was
offered, so an absent key *"is not an unknown; it is a row from a world where the
answer was always yes"* — and an explicit `false` *"is a decision its owner made
and is left exactly alone"*.

**[F] Consequences that decide the migration question.** After 0012, `offered` is
always present (and `metyet-world.js:322` requires it, on every load and save).
`keeping` is present **only** where somebody pressed "I'm keeping this one" — a
capability that shipped in this same branch. So the illegal set is exactly
`offered:false ∧ ¬keeping`, and by construction it contains every post-C2
withdrawal, every copy created through the default answer, and every withdrawn
keep. **[R] 0012 already declined to invent a disposition for a subset of these;
a backfill now would be doing what that migration refused to do, for a larger
set.**

**Disposition change inside a live package** [F, probed] — neither setter is
refused, and the partner keeps seeing the row:

```
submitted package, derived status: reserved
setCollectorCopyOffered(false) → OK, status still "reserved"
setCollectorCopyKept(true)     → OK, disposition = keeping
partner still sees: grade, cert, both photographs, status "reserved"
partner accepts                → status "committed"
```

Documented, not accidental (`metyet-commands.js:1696-1706`). §16 says why this
audit does not solve it.

**What depends on the dispositions** [F]: `proposeTradeSelection:1714` requires
`D.copyOffered`; `setInterest:1323` requires `offered === true`;
`metyet-projection.js:481` `inSupply` requires it; `collector-view.js:297-300`
filters the trade picker on it; `updateCollectorCopy:954` refuses both fields in a
patch. **Nothing reads `keeping` as a gate** — PC is enforced negatively, by
`offered !== true`.

---

## 6. Four-state representation analysis

| | **A — keep two booleans, enforce XOR** | **B — one disposition enum** | **C — other** |
|---|---|---|---|
| Persistence | zero migration; both live in `attrs` | needs a 0014 to write the enum **and** a rule for what to write on the illegal rows | — |
| Projection / privacy | unchanged; `keeping` already off the partner allow-list | a single field would cross to partners unless explicitly excluded — **a new leak surface where none existed** | — |
| Transaction predicates | unchanged — `copyOffered` is read in five places and keeps working | every one rewritten | — |
| Command ergonomics | two doors, each clearing the other — the house pattern | one door, simpler | — |
| Invalid intermediate states | none: the doctrine's XOR is exactly what the two doors already produce | the enum's third value would have to exist during migration, re-creating the thing being removed | — |
| Migration risk | the only risk is the legacy rows, which A does not touch | the legacy rows must be assigned a value to migrate at all | — |
| Tests | 14 re-pinned | 14 re-pinned plus every `offered` assertion | — |

**[R] A, decisively, and B is not a later cleanup worth planning for.** The two
booleans already *are* the XOR once the third state is refused at the door: with
`both` unreachable and `neither` refused, `offered` and `keeping` carry exactly
two states between them. An enum would buy vocabulary tidiness at the cost of a
migration, a new partner-projection surface, and rewriting five transaction
predicates — and it would need the third value to exist during the transition,
which is the state being abolished. **The vocabulary cleanup, if wanted, is in
the UI and the comments, not the storage.**

---

## 7. Specificity and identity analysis

**[F] The canonical id already carries more than the doctrine assumes.**
`0006_card_catalog.sql:123-168`: `canonical_cards` pins **`print_run`, `finish`,
`language`, `stamp`, `print_variation`** plus `card_context_id` (expansion,
collector number, name, discriminator). So naming a `canonicalCardId` is already
specific as to printing, finish and language. `0006:145` states grade and
condition are deliberately absent and always will be.

**[F] A Goal.** Identity: one `canonicalCardId` (or the legacy `cardId`).
Criteria: `desired`, a **closed two-key vocabulary — `grade` and `condition`** —
checked in three places (`addGoal:353`, `updateGoalCriteria:520`,
`validateWorld:236`), values restricted to `GRADED_VALUES` and
`CONDITION_VALUES`. Required for a canonical Goal (`criteriaRequired`), and
cannot be emptied. **Language and certification are not expressible on a Goal at
all** — a third key is refused outright.

**[F] A CollectorCopy.** Identity: one card reference, immutable. Facts: `grade`,
`condition`, `cert`, `market`, `photos`, `addedAt`, plus the dispositions.
**Only the card reference is required.** Probe: `addCollectorCopy({canonicalCardId})`
succeeds and stores `{canonicalCardId, id, collectorId, offered:false}` — no
grade, no condition, no cert, no photograph.

**[F] And a copy has no allow-list on its facts.** `:924` destructures five keys
and spreads the rest, so `language: "Japanese"` and `nickname: "my precious"` both
store durably and reach the owner's projection.

**[R] Where durable data is less specific than the doctrine implies, exactly:**

1. **A copy whose only fact is the card id** — a generic owned object in all but
   name. This is the specificity gap, and it is entirely on the copy side.
2. **A Goal specific in one dimension** — `{condition:"Near Mint"}` alone is
   accepted, an ungraded wish across every grade. The client blocks it
   (`localProblem:392` demands a grade); the domain does not.
3. **Arbitrary keys on a copy** — not a specificity gap but an integrity one, and
   it is the mirror of the closed vocabulary a Goal enjoys.

**[R] Do not add fields.** The doctrine's "which printing" half is satisfied by
the canonical id for free. If the product wants copies to be specific, the
smallest honest rule is that a copy must state a **grade** (and a condition when
Raw) — the same `gradingProblem` the domain already runs — which requires no new
field, only making an existing optional one required at the door, with the same
legacy caution as the dispositions.

---

## 8. Current Binder authority trace

[F] Condensed; the fuller trace is in the previous audit.

- **Five commands**, `metyet-commands.js:1094-1182`. None reads `goals`,
  `collectorCopies` or `offered` — the coupling was deliberately withdrawn one
  batch ago.
- **`binder_entries {binderId, canonicalCardId, addedAt}`**, `0013:87-104`. The
  DB primary key is a **positional `ord` reassigned on every save**
  (`world-repository.js:209-211`); the row has no id of its own. Unique on
  `(binder_id, canonical_card_id)`.
- **`validateWorld`** `:371-409`: binder resolves, name non-blank, `archivedAt`
  blank-or-string; entry's binder resolves, card is an id, pair unique. And
  `:364-370` explicitly **no** rule that the card is wanted or owned.
- **Projection**: the Collector gets its own binders and entries scoped through
  them; a partner gets `binders: []`, `binderEntries: []`.
- **Archive** is a reversible timestamp that touches nothing inside the binder.
- **Seed**: the prototype seeds none; production seeds nothing.

---

## 9. Legacy Binder retirement analysis

**[F] There is exactly one command binding that can create an entry** —
`fileCardInBinder` → `addBinderEntry`, reachable only from the panel's `file`
step. So "every path" means "every entrance to the panel".

| Path | What the person does | Plan | Object needed today |
|---|---|---|---|
| 1 | Browse → card → printing → tick a binder → Save | `[{file, binderId}]` | **none** |
| 2 | Binders → open a binder → **"Add cards"** → Browse → card → Save | `[{file, binderId}]` — the binder arrives pre-ticked | **none** |
| 3 | Binders → "Not in a binder yet" → Open → tick → Save | `[{file}]` | a Goal (the list is derived from `goals`) |
| 4 | A collection view → group Open → tick another binder → Save | `[{file}]` | **none** for a filed-only card |

**[R] Path 2 is the doctrine breach in its purest form**: one click, one card, one
Save, and a durable generic row exists — and the binder tick came from *where the
person navigated from*, not from anything they said about the card.

**Classification of each Binder operation** [R]:

| Operation | Class |
|---|---|
| `createBinder`, `renameBinder`, `setBinderArchived` | **already object-addressed** (the object is the binder) — unaffected |
| `removeBinderEntry` | card-addressed, **deterministically convertible** once entries name objects |
| `addBinderEntry` from paths 3 and 4-with-an-object | card-addressed, **deterministically convertible** — the step names the existing Goal or copy |
| `addBinderEntry` from paths 1, 2 and 4-filed-only | **obsolete under the new doctrine** — there is no object to name |

**Legacy rows, by class** [R] — and the hard rule is observed throughout: *a
historical card-level filing did not necessarily mean the object that happens to
exist today.*

| Class | Treatment |
|---|---|
| Goal only | **Do not migrate.** The row filed a card; it did not file that Goal. Convertible only by asking |
| exactly one CollectorCopy only | **Do not migrate.** Same reasoning. The temptation is strongest here and the rule is clearest: one object existing now is not evidence of what was meant then |
| Goal + one copy | **Ambiguous by construction.** Two candidates, no discriminator |
| multiple copies | **Ambiguous.** The row carries no grade, cert or disposition |
| Goal + multiple copies | **Ambiguous** |
| neither | **No object exists.** Cannot be migrated; under the new doctrine it should not exist at all |
| same card in several Binders | **Structurally unrepresentable** once an object has zero-or-one home — one object cannot have three |
| archived Binder | Orthogonal: whatever the class says, plus invisible to the person while archived |
| legacy `cardId`-only copy | Invisible to every canonical join, including the census. Must be counted before anything destructive |

**[R] So no class is deterministically migratable, and that is the finding.** The
brief's hard rule and the evidence agree: every legacy row either needs the
Collector to resolve it or should be discarded as something the doctrine no
longer recognises. **A migration that assigns rows to objects cannot be written
honestly.**

---

## 10. Transition authority recommendation

Of the brief's four options [R]:

| Option | Verdict |
|---|---|
| 1 — clean semantic break; legacy entries read-only until resolved or retired | **Recommended** |
| 2 — explicit migration/version state | a field whose only job is to say a migration happened; it outlives its reason and has no deletion condition |
| 3 — one-time migration plus quarantine of ambiguous rows | the migration half cannot be written honestly (§9); all rows are ambiguous, so it collapses into option 1 with extra machinery |
| 4 — something else | option 1 *is* the repository-grounded one |

**[R] The clean semantic break, stated precisely:**

- **New actions:** `addBinderEntry` names a **`goalId` XOR `copyId`** — mirroring
  the `canonicalCardId` XOR `cardId` rule the schema already uses in four tables.
  The object's home is the only authority for "where does this object belong".
- **Legacy rows** become **read-only compatibility data**. They are displayed,
  they can be **removed**, and they cannot be **created**. No fallback ever reads
  them to answer an object-level question, because they never claimed to answer
  one.
- **What the Binder UI does while unresolved rows remain** [R]: shows them,
  clearly as cards rather than objects, with the only available action being
  *remove*. A person resolves one by saying what the card means to them, which
  creates a Goal or a copy with a home — and the legacy row is then redundant and
  removable. **No inference, no prompt that guesses, no bulk action.**
- **Deletion condition** for `binder_entries` (§20.15): when the count of legacy
  rows reaches zero, measured — not estimated.

**Why this avoids all four named hazards** [R]: two records never answer the same
question, so there is no competing authority; there is no fallback; a null home
means "not filed" and nothing else, because nothing is ever migrated into it; and
the compatibility code has a measurable deletion condition rather than a vague
one.

---

## 11–12. Binder representation for Goal and CollectorCopy

**[F] The name `binderId` is already taken** and means a **CollectorCopy id** —
`interests.binderId`, `opportunity_trade_refs.binder_id`, the trade row's
`binderId`, `collectorCopyStatus(binderId, …)`, `setInterest({binderId})`,
`proposeTradeSelection({binderIds})`, and `binderById()` in the receipt, which
resolves a copy. Only `binder_entries.binder_id` means a Binder.

**[R] Use `filedIn`**, identically on both objects — the domain's own verb is
file/unfile. **Do not** add `binderId` to either object: it would put both
meanings on one row type in a codebase where `collectorCopyStatus(binderId, …)`
already takes a copy id.

**[R] Where it lives — and this is a change from my previous audit.** Previously
I recommended an `attrs` key on the copy, because it needs no migration. Under
*this* doctrine, membership must be part of object creation (§13), and
`binder_entries` is being retired rather than kept. That argues instead for
**keeping one membership table and re-keying it** — `binder_entries` gaining
`goal_id` and `collector_copy_id`, exactly one non-null, with the canonical FK
dropped. Reasons [R]:

1. It is **one** place to look for "what is in this binder", which the read models
   already query — rather than two object tables that every binder view must union.
2. It preserves `addedAt` for objects, which an `attrs` key would lose (§ below).
3. Zero-or-one home is a unique index on the object column, which the schema
   already knows how to express.
4. The legacy rows and the new rows live in one table, so "how many are left"
   is one query and the deletion condition is measurable.

The cost [R]: a migration (0014) rather than none, and a row that can still
outlive its object unless `removeGoal`/`removeCollectorCopy` clear it — which
they must do in the same state transition, because the FK cannot help (the
repository writes whole collections, and no migration in this schema declares any
`on delete` behaviour at all).

---

## 13. CardSpecification semantic transition

**[F] The frozen-plan hazard, confirmed for both object types.** `commit`
computes `steps` once at `:439` and iterates that array; `adopt` (`:428-432`)
calls `setAnswers` — it rewrites **answers**, never `steps`. The only id binding
is at `:456-459`, guarded on `record-copy`. A **Goal** id *does* come back —
`addGoal` returns `done(state, id)`, the store returns `{ok, value, …}`, and
`SignIn.jsx:237` passes it through — but `commit` discards it because the guard
filters on `record-copy`.

**[F] And `newBinders` never produce a `file` step at all** (`:230` iterates only
`answers.binders`), so a binder created in a Save gets no card in that Save — the
precedent for "you do it on the next Save".

**[R] Of the three ways to attach a Binder to an object created in the same Save:**

| | Cost | Verdict |
|---|---|---|
| **(a) membership in the create command's payload** — `addGoal`/`addCollectorCopy` accept a binder id and write the membership row alongside their own | two commands gain a second write and a second refusal; `planFrom` drops `file` for the create case. Precedent: `removeCollectorCopy` already writes two collections | **Recommended.** Atomic, no minted-id plumbing, no frozen-plan change — and **the only option that makes "a generic row cannot exist" true by construction**, because there is no moment between the object and its home |
| (b) rewrite pending steps from the minted map | no domain change, but draft handles on `start-looking` and `make-binder`, plus changes to `commit`'s plan-once contract | **and it does not make the write atomic** — a failure between the create and the file still leaves the object unfiled, which is the half-state the doctrine is removing |
| (c) file on a second Save | zero new code — except that `commit` **freezes the panel after `start-looking`** (`:326-335`, `:469-478`): the controls lock and "Done" closes. So for the Goal case the second Save is not reachable today | **the largest change dressed as the smallest** |

**[R] The semantic change, stated once:** a binder tick in the panel attaches to
the Goal or the copy that tick is *about*. Where the person has said neither, the
tick has nothing to attach to and the Save must say so — which is the same
sentence the panel used to carry for the withdrawn state guard, now true for a
different and better reason.

---

## 14. Browse / search "Add to Binder" boundary

**[R] The boundary, and nothing more than the boundary:**

> **"Add to Binder" is not an entry point. It is an action on an object that
> already exists or is being created in the same Save.**

Concretely: paths 1, 2 and 4-filed-only (§9) must stop being able to produce a
membership on their own. The person's next step is the one the product already
has — *I want this* or *I own this* — and the binder tick rides along with it
(§13a). **Path 2 needs the most care**, because today the binder arrives
pre-ticked from navigation: under the doctrine that preselection becomes a
*pending* choice that only takes effect once an object exists.

No modal is designed here, and none is implied: the panel already asks both
questions. What changes is that the Save cannot complete the filing without one
of them being answered.

---

## 15. Draft versus durable boundary

**[F] Where integrity lives today:**

| Rule | Client `localProblem` | Domain |
|---|---|---|
| Want ⇒ a grade must be stated | `:392` | **no** — the domain accepts condition-only |
| Want ⇒ criteria exist at all | implied | `criteriaRequired` |
| Grading coherence | `incoherent()` — **structure only** | `gradingProblem` — structure **and** closed vocabulary |
| Grade/condition in vocabulary | **not checked** — the `<select>` limits it, a crafted payload does not | `gradingIncoherent` |
| `market` ≥ 0 | `:405` | `invalidAmount` |
| both dispositions | unrepresentable (one radio) | `dispositionConflict` |
| **a durable copy has exactly one disposition** | **nowhere** | **nowhere** |
| **filing requires an object** | **nowhere** | **nowhere** |

**[R] The boundary to hold:** a draft may be incomplete; the moment a command
runs, the object is complete. So every durable rule belongs in the **domain
command** — the client's checks are courtesy, and the two rows above that are
currently "nowhere" must land there, not in `localProblem`. `validateWorld` takes
them only when the stored world already satisfies them (§1.2).

**[F] One mislabelled refusal found in passing.** A Goal with `desired: null` is
refused `grading-incoherent` (`addGoal:350` rejects the explicit null before
`:415` can answer `criteria-required`), so the panel would show the wrong
sentence on the one path that matters.

---

## 16. Transaction compatibility

**[F] Everything that depends on these fields**, and none of it changes under the
recommendation: `proposeTradeSelection` requires `D.copyOffered`; `setInterest`
requires `offered === true`; `inSupply` requires it; the trade picker filters on
it; `updateCollectorCopy` refuses both fields in a patch; `startOpportunity`
requires Primary; `updateGoalTier` refuses demotion while locked;
`updateGoalCriteria` and `removeGoal` refuse while any active Opportunity names
the Goal.

**Preserved, and asserted by the existing suites:** only offered copies enter
trade packages; PC copies cannot; the criteria lock stays (temporary, by the
brief); the draft → minted-copy retry fix stays; no transaction command is
exposed.

**[F] The known edge case, surfaced and not solved as instructed:** a copy inside
a submitted package can still be switched to `keeping`, and the partner keeps
seeing it — grade, cert, both photographs — and can commit it. §5 has the probe.
**[R] The durable invariant does not make solving it unavoidable**, because a
copy in a package is `offered:true` and switching it to `keeping` moves it from
one legal state to another. It stays a transaction question.

---

## 17. Live-data availability and measurement

**[F] This session cannot reach any database.** `server/config.js:124,313`
requires `DATABASE_URL`; a key-name-only probe of the environment matched
nothing; no `.env` exists in the worktree. **No count in this document is real.**

**[R] Run these read-only before anything destructive.** The disposition census
is the one that decides the whole shape of batch 2:

```sql
-- CollectorCopies by durable state
select collector_id,
       count(*)                                                          as copies,
       count(*) filter (where attrs->>'offered' = 'true')                as trade_sell,
       count(*) filter (where attrs->'keeping' is not null
                          and attrs->>'keeping' = 'true')                as pc,
       count(*) filter (where attrs->>'offered' = 'false'
                          and attrs->'keeping' is null)                  as stateless,
       count(*) filter (where attrs->'offered' is null)                  as offered_key_missing,
       count(*) filter (where canonical_card_id is null)                 as legacy_card_id_only,
       count(*) filter (where attrs->>'grade' is null)                   as no_grade
  from metyet.collector_copies group by collector_id order by collector_id;

-- Goals by tier validity
select collector_id,
       count(*)                                                          as goals,
       count(*) filter (where tier = 'primary')                          as primary_goals,
       count(*) filter (where tier = 'secondary')                        as secondary_goals,
       count(*) filter (where tier is null or tier not in ('primary','secondary')) as bad_tier,
       count(*) filter (where attrs->'desired' is null)                  as no_criteria,
       count(*) filter (where canonical_card_id is null)                 as legacy_card_id_only
  from metyet.goals group by collector_id order by collector_id;

-- Binder entries by resolvability class (the six partition exactly; g and h overlay)
with entry as (
  select b.collector_id, e.ord, e.canonical_card_id,
         (b.attrs ->> 'archivedAt') is not null as archived
    from metyet.binder_entries e join metyet.binders b on b.id = e.binder_id
), sized as (
  select e.*,
    (select count(*) from metyet.collector_copies c
      where c.collector_id = e.collector_id and c.canonical_card_id = e.canonical_card_id) as copies,
    (select count(*) from metyet.goals g
      where g.collector_id = e.collector_id and g.canonical_card_id = e.canonical_card_id) as goals,
    (select count(distinct x.binder_id) from metyet.binder_entries x
       join metyet.binders xb on xb.id = x.binder_id
      where xb.collector_id = e.collector_id and x.canonical_card_id = e.canonical_card_id) as binders_holding
  from entry e
)
select collector_id, count(*) as entries,
       count(*) filter (where goals = 0 and copies = 1) as one_copy_only,
       count(*) filter (where goals = 0 and copies > 1) as many_copies,
       count(*) filter (where goals > 0 and copies = 1) as goal_and_one_copy,
       count(*) filter (where goals > 0 and copies > 1) as goal_and_many,
       count(*) filter (where goals > 0 and copies = 0) as goal_only,
       count(*) filter (where goals = 0 and copies = 0) as neither,
       count(*) filter (where binders_holding > 1)      as multi_binder_overlay,
       count(*) filter (where archived)                 as archived_overlay
  from sized group by collector_id order by collector_id;
```

**[F] `stateless` in the first query is the number that decides batch 2.** If it
is zero, the invariant can go into `validateWorld` immediately. If it is not, it
is legacy-tolerated until resolved, and nothing invents a disposition.

---

## 18. Scenarios A–L

**A — Browse → "Add to Binder" on a card neither owned nor wanted.** [R] No
durable row may result. The person must first answer *want* or *own*; the binder
tick attaches to whichever object that creates (§13a). If they answer neither,
the Save files nothing and says why. **[F] Today this is path 1 or 2 and produces
a generic row with one click.**

**B — Primary PSA 10 Goal, filed in Binder A.** [R] One durable object — the
Goal, `tier: "primary"`, `desired: {grade: "PSA 10"}` — and one membership naming
that Goal. **[F] The English part is already carried by the canonical id**
(`0006` pins language), so nothing extra is needed for it.

**C — Owned PSA 9 Mudkip, PC, Binder B.** [R] One CollectorCopy,
`{offered:false, keeping:true, grade:"PSA 9"}`, and one membership naming that
copy.

**D — Primary PSA 10 Goal + PC PSA 9 copy + Trade/Sell Raw NM copy, different
homes.** [R] Three objects, three independent memberships, and a canonical-card
membership **cannot express it** — one card, three intentions, three places. This
is the scenario that makes the case on its own.

**E — A stateless copy.** [F] Reachable today, by default. [R] Transition: refuse
it at the door for **new** writes; leave existing rows as legacy-tolerated; let
the person resolve one the next time they touch the copy. **Never assign a
disposition** — 0012 declined to do exactly that, for a smaller set.

**F — Both dispositions.** [F] Already impossible: refused at
`addCollectorCopy`, unreachable in the UI, cleared by each setter, and reported
by `validateWorld`. Unchanged.

**G — Legacy Binder row with no Goal and no copy.** [R] No object exists, nothing
is invented. The row is displayed as legacy, can be removed, and cannot be
created again. Under the new doctrine it is the clearest example of what is being
retired.

**H — Legacy row with one Goal and one copy.** [R] **Both are candidates and
neither is evidence.** The row filed a card at a time when the product had no
other option. Resolved only by the Collector, or removed.

**I — Future Binder Delete.** [R] The binder goes; every membership naming it
goes; **every Goal and every copy survives, unfiled, with its state unchanged**.
The guarantee must be in the domain command, because the repository writes whole
collections and **no migration in this schema declares any `on delete`
behaviour** [F].

**J — PC ↔ Trade/Sell.** [R] The home is untouched. Already true today for
card-level membership, and the last batch's `[23]` pins it across six
transitions.

**K — Primary ↔ Secondary.** [R] Same — pinned today by `[22]`.

**L — A failed Save must not strand an object stateless.** [F] `commit` halts at
the first refusal, and the plan is currently ordered so everything refusable only
for itself runs before the three commands a live deal can refuse
(`updateGoalCriteria`, `updateGoalTier`, `updateCollectorCopy`). [R] **Under
§13a this hazard largely disappears for creation**, because the object and its
home are one command. What remains is the ordinary case: a Goal edit refused
`goal-locked` must not cost an unrelated copy, which the current ordering already
guarantees and which the new commands must not disturb.

---

## 19. Risks and contradictions

**19.1 — The withdrawal gap is a blocker, not a detail.** [F/P needed] Covered in
§1.3. Until the product says what "Haven't decided" becomes, `addCollectorCopy`
cannot be tightened without also deciding what the two setters' `false` branch
means.

**19.2 — `validateWorld` runs on load.** [F] The single most dangerous move in
this whole programme is putting the XOR there first. Three recorded scars say so.

**19.3 — No legacy Binder row is deterministically migratable.** [F/R] §9. Any
plan that assumes "one copy exists, so that is what was meant" violates the
brief's own hard rule.

**19.4 — A copy can still be created with nothing but a card id.** [F] The
doctrine says durable objects are specific; a copy with no grade is not. Cheapest
honest rule: require what `gradingProblem` already understands. Flagged, not
assumed.

**19.5 — A copy accepts arbitrary durable keys.** [F] `language`, `nickname` and
anything else round-trip and reach the owner's projection. Not a doctrine
violation, but it is the opposite of the closed vocabulary a Goal enjoys, and it
means "specific" is currently unbounded rather than defined.

**19.6 — Goal tier is silently coerced.** [F] `"Primary"` demotes a Goal with a
200. Under a doctrine of chosen states this is the smallest and clearest fix in
the audit.

**19.7 — Two tests call `saveWorld` with a stateless copy.** [F] Those fail at
the persistence boundary, not as assertions, the moment the invariant reaches
`validateWorld`. They are the canary for 19.2.

---

## 20. Target architecture

1. **Durable object types:** Goal, CollectorCopy. Nothing else. [P]
2. **States:** Primary XOR Secondary (Goal); PC XOR Trade/Sell (copy). [P]
3. **Goal enforcement:** already structural. Add a refusal for a tier that is
   neither value, replacing the silent default. [R]
4. **Copy enforcement:** keep the two booleans; refuse a create with no
   disposition and refuse (or redefine) the withdrawal branch of both setters —
   at the **command**, not in `validateWorld`, until §17 says the stored world
   already complies. [R]
5. **"Specific":** the canonical id already pins printing, finish and language.
   Add no fields; if specificity is wanted on copies, require a grade through the
   existing `gradingProblem`. [R]
6. **Goal Binder representation:** a membership row naming `goalId`. [R]
7. **Copy Binder representation:** the same row naming `copyId`. Exactly one of
   the two non-null, mirroring the schema's existing XOR pattern. Field name
   `filedIn` wherever the object side is named — **never `binderId`**, which
   means a copy id. [R]
8. **Unfiled:** no membership row. Not a flag, not a default binder. [R]
9. **Canonical-card membership:** **retired.** Not preserved, not migrated. [P]
10. **Legacy `binder_entries`:** read-only compatibility — displayable,
    removable, never creatable. No fallback reads them for an object question. [R]
11. **Ambiguous rows:** resolved only by the Collector, or removed. **Nothing is
    inferred from the objects that happen to exist now.** [P/R]
12. **CardSpecification:** a binder tick attaches to the Goal or copy it is
    about, carried in the create command's payload (§13a). [R]
13. **Browse "Add to Binder":** not an entry point; an action on an object. [R]
14. **Transactions:** unchanged. Every predicate in §16 keeps working because the
    two booleans stay. [R]
15. **Deletion condition for `binder_entries`:** when the measured count of
    legacy rows is zero. Not an estimate. [R]
16. **Temporary compatibility code:** exactly one piece — the read path that
    displays legacy rows in the Binder view. Deleted with the table, by the same
    condition. [R]

---

## 21. Implementation batches

**Batch 1 — Goal tier is chosen, not defaulted.**
*Purpose:* the cheapest piece of the doctrine, and it stands alone.
*Files:* `domain/metyet-commands.js`, `domain/metyet-domain.js` (one refusal
code), tests.
*Changes:* `addGoal` and `updateGoalTier` refuse a tier that is neither value.
*Unchanged:* everything else. *Migration:* none. *Rollback:* a revert.
*Adversarial:* every existing caller passes a legal tier; a typo is refused, not
demoted; `startOpportunity`'s Primary gate is untouched.
*Stop:* when a bad tier is a refusal.

**Batch 2 — the copy's disposition is chosen, at the door only.**
*Blocked on:* the §1.3 product decision, and the §17 census.
*Purpose:* no NEW stateless copy.
*Files:* `domain/metyet-commands.js` (`addCollectorCopy`, both setters),
`client/collector/CardSpecification.jsx` (the third option), ~14 tests.
*Changes:* a create with no disposition is refused; the withdrawal branch does
whatever the product decided. **`validateWorld` is NOT touched.**
*Unchanged:* every stored row; every transaction predicate.
*Migration:* none. *Rollback:* a revert; no data has changed.
*Adversarial:* an existing stateless copy still loads, still saves, still
projects, and can still be given a disposition; the two `saveWorld` tests still
pass; `proposeTradeSelection` still refuses a PC copy and one with no
disposition.
*Stop:* when no new stateless copy can be created and no stored world has moved.

**Batch 3 — object-level membership, additive.**
*Purpose:* memberships name objects.
*Files:* a `0014` adding `goal_id` and `collector_copy_id` to `binder_entries`
with exactly-one-non-null and a unique index per object; `world-repository.js`;
`domain/metyet-world.js`; `addBinderEntry`/`removeBinderEntry`;
`addGoal`/`addCollectorCopy` (membership in the payload, §13a);
`client/collector/sections/Binder.jsx` and `Collection.jsx` (read both kinds of
row); `CardSpecification.jsx`.
*Changes:* new memberships name an object; legacy rows become read-only.
*Unchanged:* Archive; Goal cardinality; transactions; every legacy row's data.
*Migration:* additive columns only — **no row is rewritten**.
*Rollback:* revert the code; the columns are unread and harmless.
*Adversarial:* a Goal and two copies of one card get three independent homes
(scenario D); deleting an object clears its membership in the same transition;
an archived binder keeps its objects; a legacy row still displays and can still
be removed; **no path creates a membership without an object**.
*Stop:* when scenario D works and scenario A is impossible.

**Batch 4 — resolution and retirement.** Only after §17 is measured: the Binder
view offers *remove* on legacy rows; when the count reaches zero, `0015` drops
the canonical column and the compatibility read path goes with it.

**Batch 5 — `validateWorld` takes the invariants**, once and only once the census
says every stored row complies.

**Ordering, explicitly** [R]: tier (1) → disposition at the door (2) → object
membership (3) → legacy retirement (4) → durable validation (5). **Batch 5 last
is not a preference. It is the difference between a refusal and an outage.**

---

## 22. First batch stop condition

**Stop after Batch 1.** It is one refusal code and two guards, it needs no
product decision, no migration and no census, and it makes the Goal half of the
doctrine true.

**Do not, in that batch:** touch `addCollectorCopy` or either disposition setter;
add any field to any object; change `binder_entries`; change CardSpecification's
answer model; add any rule to `validateWorld`; or expose any transaction command.

**And before Batch 2 can start, two things are needed from the product** [P
needed]:

1. **What does withdrawing a disposition mean?** If a copy must be PC or
   Trade/Sell, then "Haven't decided" cannot be an answer — so the control becomes
   two-way and every change is a switch. Confirm that, because it means a person
   who has just bought a card must state an intention they may not have formed.
2. **What happens to the existing stateless rows?** The recommendation is
   legacy-tolerated, resolved when the person next touches the copy, and **never
   assigned** — because migration 0012 already declined to invent a disposition
   for a smaller set, and its reasoning applies with more force here.
