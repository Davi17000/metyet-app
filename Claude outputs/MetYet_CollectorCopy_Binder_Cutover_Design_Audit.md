# MetYet — CollectorCopy Binder Cutover Design Audit

Audit and design only. **Nothing was implemented.** No code, test, migration or
schema was changed; no `binderId` was added; `binder_entries` is untouched;
nothing merged.

Labels throughout: **[F]** observed repository fact · **[P]** product decision
supplied by the brief or already closed · **[R]** architectural recommendation,
mine and arguable.

---

## 1. Executive recommendation

**There is no cutover, because there is nothing to cut over from.** [R]

The brief frames this as replacing card-level membership with copy-level
membership, and names the two risks that framing creates — competing
authorities, and null meaning either "unfiled" or "not migrated". The audit's
central finding is that **both risks exist only inside that framing, and the
framing does not survive contact with the repository.**

Three classes of existing membership have **no copy-level representation at
all**, and one of them is the state a binder is documented as starting in [F]:

> *"A Binder entry whose card the Collector neither wants nor owns is perfectly
> valid — that is curation, which is what a binder is for."*
> — `persistence/migrations/0013_binders.sql:17-19`

A card you do not own has no copy to carry its home. So `binder_entries` cannot
be migrated away without deleting the ability to file a card you neither own nor
want — which is not a migration detail, it is a **product reversal**, and one
this branch deliberately restored a batch ago.

So the recommendation is not a cutover with a dual-read period. It is:

> **Two records, two different questions, one authority each, forever.**
>
> - *"Which binder is this specific copy in?"* → **`copy.filedIn`**, always,
>   at every stage, with absent meaning **not filed**.
> - *"Which binders is this card filed in, as a card?"* → **`binder_entries`**,
>   always, unchanged, gaining no new meaning.

**No fallback. No dual-read. No dual-write. No migration of legacy rows.** The
competing-authority risk cannot arise because the two records never answer the
same question, and the absence ambiguity cannot arise because nothing is ever
migrated into `filedIn` — so absent has only ever meant one thing.

Three further findings that change the shape of the first batch:

1. **[F] The name `binderId` is already taken and means a CollectorCopy id** —
   in `interests`, in `opportunity_trade_refs`, in every trade-card row, and in
   `collectorCopyStatus(binderId, …)`. Adding `CollectorCopy.binderId` meaning
   *a Binder* would put both meanings on one row type. Call it **`filedIn`**.
2. **[F] A copy minted in the same Save cannot be filed in that Save.** `commit`
   computes its step list once and `adopt` rewrites `answers`, not the frozen
   plan — and there is precedent: a card is filed into a newly created binder
   only on the *second* Save (`tests/phase5-c33-card-specification.cjs:1299`).
3. **[F] A copy-level home can ship without touching Goals, but NOT without
   changing two read models in the same batch** — `Binder.jsx`'s `countOf` and
   `Collection.jsx`'s binder view. Ship the field alone and a binder holding
   three filed copies reads **"0 cards"**: a durable fact recorded and then
   invisible, which is the C2.1 failure exactly.

---

## 2. SHA and worktree

| | |
|---|---|
| **Inspected** | `b68b1ae` on `phase-5-four-state` [F] |
| **Ancestry** | `b68b1ae` ← `17743d5` ← `5931dbb` ← `f43d946` ← `64f88e1` |
| **Worktree** | `/home/claude/s1`, `git status --porcelain` empty before and after |
| **Changed by this audit** | nothing except this document |

---

## 3. Current Binder authority trace

**Writes** [F] — five commands, all in `domain/metyet-commands.js:1094-1182`:

| Command | Writes | Refuses | Reads to decide |
|---|---|---|---|
| `createBinder` :1094 | `{id, collectorId, name, createdAt, archivedAt:null}` | `notOwner`, `nameRequired` | seat only — **no entries** |
| `renameBinder` :1103 | `name` | `notFound`, `notOwner`, `nameRequired` | the binder row; *"does not touch membership"* |
| `setBinderArchived` :1131 | `archivedAt` | `notFound`, `notOwner` | the binder row; idempotent |
| `addBinderEntry` :1153 | `{binderId, canonicalCardId, addedAt}` | `notFound` (binder, or blank card id), `notOwner` | ownership + a scan for the existing pair → idempotent, **first `addedAt` stands** |
| `removeBinderEntry` :1173 | filters the pair out | `notFound`, `notOwner` | the same scan; absent is a no-op, not an error |

None of the five reads `goals`, `collectorCopies` or `offered`. Conversely
`removeCollectorCopy` cascades **only** `interests`
(`metyet-commands.js:1046-1050`).

**Exposure** [F] `server/exposed-commands.js:106-108` and `:128-129` — all five
are live. `server/app.js:88-91,476-478` checks `payload.canonicalCardId` against
the catalog before `addBinderEntry` runs.

**Client** [F] builders `client/commands.js:336-379`; the switch
`client/sign-in/SignIn.jsx:230-233`, where `file`/`unfile` carry **only a binder
id and the panel's one canonical card** — no copy id, no goal id.

**Persistence** [F] `persistence/migrations/0013_binders.sql:74-104` —
`binders(id, ord, collector_id, attrs)` with `name`/`createdAt`/`archivedAt` in
`attrs`; `binder_entries(ord PK, binder_id, canonical_card_id, attrs)` with
`addedAt` in `attrs`, a unique index on `(binder_id, canonical_card_id)`, and
FKs to `binders` and `metyet_catalog.canonical_cards`. **The entry has no id of
its own: `ord` is positional and reassigned on every save**
(`world-repository.js:209-211`).

**Validation** [F] `domain/metyet-world.js:371-409` — a binder's `collectorId`
must resolve, `name` non-blank, `archivedAt` blank or a string; an entry's
`binderId` must resolve, `canonicalCardId` must be an id, and the pair must be
unique. And explicitly, `:364-370`, *no* rule that the card is wanted or owned:
*"Coupling this to Goals or copies would make organising imply demand."*

**Projection** [F] Collector gets its own binders whole and entries scoped
through them (`metyet-projection.js:427-428`). A Trusted Partner gets
`binders: []` and `binderEntries: []` — *"no membership and — just as
importantly — no COUNT and no derived hint"* (`:508-522`).

**Seed** [F] The prototype seeds none (`domain/metyet-store.js:47-52`), and
production seeds nothing at all (`server/bootstrap.js` contains no occurrence of
"binder"). `0013:64-70`: *"NO BACKFILL, AND NO DEFAULT BINDER."*

---

## 4. CollectorCopy identity trace

[F] The id is minted at `metyet-commands.js:924` (`ctx.id("b", askedId)` — the
prefix is still the legacy letter). Columns are only `id`, `collector_id`,
`card_id`, `canonical_card_id`; **everything else, including `offered` and
`keeping`, is `attrs` jsonb** (`0011_collector_copies.sql`,
`world-repository.js:101-103`). `updateCollectorCopy` holds `cardId`,
`canonicalCardId`, `id`, `collectorId`, `offered` and `keeping` immutable
(`:948-953`). Disposition has its own two doors. `removeCollectorCopy` cascades
only `interests`. The Collector's projection sends the copy whole plus a derived
`status`; the partner gets an allow-list, so **a new `attrs` key is dropped for
partners automatically** (`metyet-projection.js:202-203`).

**The narrowest attachment point is an `attrs` key, not a column.** [R] A column
costs migration 0014 plus a `fields` entry in the repository; an `attrs` key
costs neither — verified by probe: an arbitrary key survives
`addCollectorCopy`'s rest-spread, round-trips through `attrs`, and
`validateWorld` accepts it, because there is no unknown-key rule.

**And migration 0012's lesson points the other way here, which is the good
direction.** [F/R] 0012 exists because an absent `attrs` key silently did the
work of `false` and cost a Collector their visible supply. The trap is *requiring*
a field, or *inferring* from its absence. Here absence means "not filed", which
is honestly true of every copy that exists — and stays true precisely because
nothing is ever migrated into the field (§9).

### The name — do not call it `binderId` [F]

`binderId` already means **a CollectorCopy id**, legacy naming from when
`collector_copies` was `binder_copies`:

| Site | What `binderId` means there |
|---|---|
| `interests.binderId` | a CollectorCopy id — `metyet-projection.js:206,430`, `metyet-world.js:411-416`, `metyet-commands.js:1050` |
| `opportunity_trade_refs.binder_id` / the trade row | a CollectorCopy id — `emptyTradeCard` `metyet-domain.js:1695-1700`, read at `:1288-1291,1314` |
| `collectorCopyStatus(binderId, opps, …)` | a CollectorCopy id — `metyet-domain.js:1654-1659` |
| `setInterest({binderId, on})` | a CollectorCopy id — `metyet-commands.js:1318` |
| `proposeTradeSelection({binderIds})` | CollectorCopy ids — `metyet-commands.js:1658` |
| `binderById(id)` in the receipt | resolves a **copy** — `collector/MetYetCollector.jsx:5801` |
| `binder_entries.binder_id` | **a Binder** — the only one |

Adding `CollectorCopy.binderId` meaning a Binder would make
`collectorCopies[i].binderId` a Binder while `interests[j].binderId` and
`tradeCards[k].binderId` are *that same copy's id*. **[R] `filedIn`** — the
domain's own verb is file/unfile (`client/commands.js:343-356`).

---

## 5. Persistence and cutover options

| | Authority | Ambiguity | Rollback | Deletion path |
|---|---|---|---|---|
| **A** — nullable `filedIn`, keep entries, fall back when absent | **Two records answer one question.** The risk the brief names, realised | **Yes** — absent means unfiled *or* not migrated, and nothing can tell | cheap early, expensive after migration | never, honestly: the fallback becomes load-bearing |
| **B** — A plus a per-copy migration marker | One, if the marker is trusted | Removed, at the cost of a field whose only job is to say a migration happened | as A, plus the marker to remove | the marker is a second thing to delete and will outlive its reason |
| **C** — one-time cutover, no dual read | One, cleanly | None | **the one-way door**, and it is taken on day one | immediate — but **impossible**: classes (e), (f), (g) have no copy-level form (§6) |
| **D** — narrow temporary legacy compatibility layer | One nominally, two in practice | deferred, not removed | as A | "temporary" with no deletion condition is how a compatibility layer becomes permanent |
| **E — RECOMMENDED: two questions, one authority each, no migration** | **One per question, at every stage** | **None — nothing is ever migrated in, so absent has only ever meant "not filed"** | Each stage additive and independently revertable | `binder_entries` is not deleted; §21 gives the only condition under which it could be |

**[R] E is the recommendation**, and it is not a compromise between A and C — it
is the observation that `copy.filedIn` and `binder_entries` were never answering
the same question. A legacy entry says *"this card belongs in this binder"*. It
has never said anything about a copy, and reading it as if it did is what creates
both named risks.

---

## 6. Legacy determinism matrix

For each existing card-level membership, can it be assigned to a **specific
CollectorCopy**? [F] for the classes, [R] for the verdicts.

| Class | Situation | Verdict |
|---|---|---|
| **(a)** | exactly one copy, no Goal | **Deterministic.** One copy exists |
| **(b)** | several copies, no Goal | **Ambiguous — the Collector must choose.** Nothing in the row distinguishes a Raw NM from a PSA 10. Any tie-break would be invented |
| **(c)** | a Goal and exactly one copy | **Deterministic for the copy.** The Goal is a separate fact needing no home |
| **(d)** | a Goal and several copies | **Ambiguous**, as (b). The Goal does not disambiguate |
| **(e)** | a Goal only, no copy | **Goal-relevant, not copy-relevant.** There is no copy to file |
| **(f)** | neither a Goal nor a copy | **Not representable.** `0013:17-19` calls this *"curation, which is what a binder is for"*; `metyet-world.js:364-370` refuses to couple membership to state |
| **(g)** | the same card in several binders | **Structurally unrepresentable** in a single-home model, whatever the copy count — one copy cannot have two homes |
| **(h)** | the binder is archived | **Orthogonal.** Determinism is whatever (a)–(g) says; archive changes only what the home *means* (§10) |

**[R] The finding that matters: (e), (f) and (g) are not hard cases. They are
states a copy-level home cannot express at all** — and (f) is the documented
common case. This is what rules out option C and what makes "delete
`binder_entries`" a product decision rather than a migration step.

---

## 7. Live-data availability, and exactly what must be measured

**[F] This session cannot reach any database, and no count in this document is
real.** `server/config.js:124,313` requires `DATABASE_URL`; a key-name-only probe
of the environment (no values read or printed) matched nothing, and no `.env`
file exists in the worktree. `persistence/database.js` offers an in-process
PGlite for tests, which holds no production rows. **No production counts are
fabricated anywhere in this audit.**

**[R] Under recommendation E no census is required before the first batch,
because nothing is migrated.** The census below is needed only if the product
later decides to retire `binder_entries` (§21). Run it read-only, against the
real schema:

```sql
with entry as (
  select b.collector_id, e.binder_id, e.ord as entry_ord, e.canonical_card_id,
         (b.attrs ->> 'archivedAt') is not null as binder_archived
    from metyet.binder_entries e
    join metyet.binders b on b.id = e.binder_id
), sized as (
  select e.*,
    (select count(*) from metyet.collector_copies c
      where c.collector_id = e.collector_id
        and c.canonical_card_id = e.canonical_card_id)            as copies,
    (select count(*) from metyet.goals g
      where g.collector_id = e.collector_id
        and g.canonical_card_id = e.canonical_card_id)            as goals,
    (select count(distinct x.binder_id)
       from metyet.binder_entries x
       join metyet.binders xb on xb.id = x.binder_id
      where xb.collector_id = e.collector_id
        and x.canonical_card_id = e.canonical_card_id)            as binders_holding
  from entry e
)
select collector_id,
       count(*)                                          as entries,
       count(*) filter (where goals = 0 and copies = 1)  as class_a,
       count(*) filter (where goals = 0 and copies > 1)  as class_b,
       count(*) filter (where goals > 0 and copies = 1)  as class_c,
       count(*) filter (where goals > 0 and copies > 1)  as class_d,
       count(*) filter (where goals > 0 and copies = 0)  as class_e,
       count(*) filter (where goals = 0 and copies = 0)  as class_f,
       count(*) filter (where binders_holding > 1)       as class_g_overlay,
       count(*) filter (where binder_archived)           as class_h_overlay
  from sized group by collector_id order by collector_id;
```

**[F] (a)–(f) partition the entries exactly** — they are the six cells of
`goals ∈ {0,>0}` × `copies ∈ {0,1,>1}`, and `goals > 0` always means exactly one
Goal because of the unique index at `0008:55`. **(g) and (h) are orthogonal
overlays**: an entry can be (a) *and* (g) *and* (h). Never add the overlays into
the partition total.

**[F] One blind spot to run alongside it.** `0011:50` made
`canonical_card_id` nullable and kept the legacy `card_id`, so a copy naming only
the legacy id matches nothing above and is silently counted as `copies = 0`:

```sql
select collector_id,
       count(*) filter (where canonical_card_id is null)     as legacy_only_copies,
       count(*) filter (where canonical_card_id is not null) as canonical_copies,
       count(*) filter (where attrs -> 'offered' is null)    as offered_unset
  from metyet.collector_copies group by collector_id order by collector_id;
```

---

## 8. Authority at every stage

The brief asks for **one** authoritative answer at each stage. Under E: [R]

| Stage | "Which Binder is this CollectorCopy in?" | "Which binders is this card filed in, as a card?" |
|---|---|---|
| **Before** (today) | **Nothing answers it.** The question is not asked and no record claims to. Not "the legacy entry" — an entry has never named a copy | `binder_entries` |
| **Field added, unwritten** | `copy.filedIn` — absent for every copy, so the answer is "none", and it is correct | `binder_entries`, unchanged |
| **Field written and read** | `copy.filedIn` | `binder_entries`, unchanged |
| **After**, at every later point | `copy.filedIn` | `binder_entries`, unchanged |

**There is no stage at which two records answer one question, so no precedence
rule is needed, no fallback exists, and there is no compatibility layer that
could quietly become permanent.** The read models union the two *answers*
(§15) — which is display, not authority: "what is in this binder" is legitimately
"cards filed as cards, plus copies filed as copies", and each half has exactly
one source.

---

## 9. Unfiled versus not-migrated

[R] Under E the second state does not exist, which is the point.

| State | Representation |
|---|---|
| **deliberately unfiled** | `filedIn` absent. The only meaning it has |
| **not yet migrated** | **does not exist** — nothing is ever migrated into `filedIn`, so no copy is ever "waiting" |
| **invalid binder reference** | `filedIn` names a binder that is not in the world → reported by `validateWorld` as `ref.unknown` (§16). Distinct from absent, and loud |
| **deleted binder** | cannot arise: `deleteBinder` must clear the homes in the same state transition (§11), and `validateWorld` catches it if one ever does |
| **missing data** | indistinguishable from unfiled **by design**, and safe here precisely because absence was never given a second meaning |

**No permanent "Unfiled Binder" is created.** Unfiled is the absence of a
reference, not a place.

---

## 10. Archive implications

[F] Today `setBinderArchived` writes a timestamp and *"touches nothing else"*
(`metyet-commands.js:1124-1127`); its entries are completely unaffected. Three UI
filters read it: the active/archived split (`Binder.jsx:83,85`), the
"not in a binder yet" question, which counts only **active** binders
(`:101-105`), and the filing picker, which never offers or preselects an archived
binder (`CardSpecification.jsx:314,348`).

**[R] Preserve exactly that.** A copy whose `filedIn` names an archived binder
is **still filed and still points there** — archiving must never null a home, or
unarchiving would return a different binder. Every *"is this actively
organised?"* derivation must join `binders` and test `archivedAt is null`, which
is precisely what `filedSomewhereActive` already does.

**[R] One thing becomes newly ambiguous and should be named now rather than
discovered.** Today "in an archived binder" and "in no binder" are different
rows. With an optional home there are three conditions — absent, present and
active, present and archived — and only two answers most screens want to give.
Nothing breaks, but any screen that says "unfiled" must decide which of the two
it means, and say the same thing everywhere.

---

## 11. Future Binder Delete

**[F] The foreign key cannot help, and neither can `on delete`.** A grep of
every migration for `on delete` / `on update` returns **nothing**: every FK,
including `binder_entries_binder_fk` (`0013:90-91`), is `deferrable initially
deferred` with the default `NO ACTION`.

**[F] And the repository writes whole collections, not rows.**
`world-repository.js:335-346` walks each table deleting-then-upserting, where
"deleted" means *whatever the in-memory world no longer contains*. `TABLES`
order puts `collectorCopies` (`:104`) before `binders` (`:110`) before
`binderEntries` (`:112`) — a save that drops a binder deletes the binder row
before its entries, and only the deferred constraint keeps that legal at COMMIT.
An `on delete set null` would never fire, because no `DELETE FROM binders` is
ever issued.

**[R] So the guarantee must come from the domain command, and nowhere else.**
A future `deleteBinder` must, in one pure state transition, remove the binder
**and** clear `filedIn` on every copy that named it **and** drop its
`binder_entries` rows. `validateWorld`'s dangling-reference rule (§16) is the
*detector*, not the guarantee — if it were relied on, a dangling home would
surface as a 500 at load rather than a copy quietly becoming unfiled.
**Never cascade-delete a CollectorCopy**: the copy is the person's property and
the binder is a label on it.

---

## 12. `addedAt`

**[F] The verdict is split, and it is worth having exactly.**

- **Rendered?** No. No surface renders an entry's `addedAt`; `Collection.jsx:411`
  renders `copy.addedAt`, which is a different fact.
- **Sorted by?** **Yes, once, indirectly.** `Collection.jsx:230` feeds it into
  `touchedAt`, which orders every Collection view — one of three contributors
  (goal `createdAt`, copy `addedAt`), max-wins. For a filed-but-unowned card it
  is the **only** recency signal, and cards with no date sort last (`:222`).
- **Analytics or audit?** No. `countOf` is a Set size; the partner receives
  nothing.
- **Tests?** Four, all about **idempotency** — that re-filing does not restamp
  (`phase5-c31:247,253,567,827`; `phase5-c33:807-811`) — plus two shape pins
  asserting the row's exact key set.

**[R] Decision: `binder_entries.addedAt` stays exactly as it is** (it is the
only recency a curated unowned card has), **and the first batch does not add a
`filedAt` to the copy.** A copy already carries `addedAt`, which supplies its
recency mark today, so nothing regresses.

**But record the open question rather than deciding it by inertia** [R]: the
command's own comment says re-filing must not restamp *"or 'when did this go in
the binder' would quietly become 'when did I last click it'"*
(`metyet-commands.js:1149-1152`). A single `filedIn` field with no companion
timestamp cannot answer that question for a copy at all. If the product wants it,
it is one more `attrs` key and it must be written on a *change* of home, not on
every save. Nothing renders it today, so shipping without it costs nothing
visible.

---

## 13. Proposed command surface

**[R] One setter, following the house pattern the repository already argues
for:**

```
setCollectorCopyFiledIn({ copyId, filedIn })      filedIn: a binder id, or null
```

- unfiled → A: `filedIn: "bd…"`
- A → B: `filedIn: "bd…"` — **one call, not two**
- A → unfiled: `filedIn: null`

**Why a setter.** [F] `setBinderArchived`'s own header makes the case:
*"`setCollectorCopyOffered` established the shape for a reversible state a
person controls — one command, a boolean, idempotent — and a one-way
`archiveBinder` would need a second command to undo it, which is two names for
one decision."* A binder home is exactly that shape. Adapting
`addBinderEntry`/`removeBinderEntry` instead would need two calls for a move and
would put a copy id beside a parameter that already means a binder.

**Refusals:** `notOwner` if the seat is not the collector, if the copy is not
theirs, or if the binder is not theirs; `notFound` for an unknown copy or an
unknown binder. **No state dependency of any kind** — filing is organisation, and
that is the rule the last batch restored.

**[R] `addBinderEntry` and `removeBinderEntry` are neither adapted nor retired.**
They keep their exact meaning: a card filed as a card. They are what a Goal and
an unowned card use, and what class (e) and (f) need. Retiring them is the
product decision in §21, not a step in this transition.

---

## 14. CardSpecification cutover trace

**[F] How filing addresses a card today.** `planFrom` builds
`filedNow = new Set(entries.map(e => e.binderId))` from entries for **the panel's
one canonical card** (`:113-116`); `answers.binders` is a Set of binder ids
(`initialAnswers:293`); `file`/`unfile` steps carry a binder id
(`:229-234`); `SignIn.jsx:232` fills in the canonical card.

**[F] Two things the panel cannot currently do, and one is a hazard.**

1. **`answers` has no per-copy binder field.** `asDraft` (`:81-96`) and
   `BLANK_COPY` (`:106`) carry none, and the model is one Set **per card**. There
   is no answer shape in which copy X is in binder A and copy Y in binder B. The
   read side matches: `copiesOfCard` (`Collection.jsx:153-163`) is keyed by card,
   so opening binder A renders the card *and every copy of it*.
2. **A copy minted in the same Save cannot be filed in that Save.** `commit`
   computes `steps` once, before the loop (`:439`); `adopt` rewrites `answers`,
   **not the frozen `steps` array** (`:450,462,489`). A filing step planned for a
   copy that does not yet exist would carry `copyId: null` and nothing could
   substitute the minted id mid-sequence. **There is precedent and it is
   accepted behaviour**: `make-binder` mints a binder id that nothing binds back,
   and a card is filed into a newly created binder only on the **second** Save
   (`tests/phase5-c33-card-specification.cjs:1299-1344`).

**[R] So the first batch does not put copy-filing in CardSpecification at all.**
The panel's answer model would have to grow a per-draft binder field and the
card-keyed copy index would have to stop being the only index — that is a UI
change, and the brief forbids designing one. The honest first surface is the one
place a copy is *already* addressed individually: the copy row on Your Cards.
Nothing about the panel changes, `answers.binders` keeps its exact meaning (a
card filed as a card), and the plan-once contract is untouched.

**[R] When the panel does take it on, the two options are:** plan a copy-filing
step only for copies that already have an id, deferring a new copy's filing to
the next Save (matching the `make-binder` precedent); or extend `commit` to
rewrite pending steps from `minted` before dispatch — which changes the
plan-once contract and should be decided deliberately, not slipped in.

---

## 15. Read-model inventory

[F] Every surface that answers a binder-membership question, and what changes.

| Surface | Reads today | After a copy-level home |
|---|---|---|
| `Binder.jsx:92-98` `cardsIn`/`countOf` | `binderEntries` → Set of card ids → `.size` | **MUST UNION.** Otherwise a binder holding three filed copies reads "0 cards" |
| `Collection.jsx:170-172` binder view | `entries.filter(e => e.binderId === binderId)` | **MUST UNION.** Otherwise filed copies do not appear in the binder they are filed in |
| `Binder.jsx:102-107` `unfiled` | entries in **active** binders vs Goals | **Should union** — a Goal whose card is filed only through a copy would read as unfiled. Goals-only today, so it stays coherent either way |
| `CardSpecification.jsx:113-116, 287-293` | entries → `filedNow`, `answers.binders` | **No change in the first batch** — the panel keeps addressing cards as cards (§14) |
| `Collection.jsx:196-202` All Cards | union of entries ∪ goals ∪ copies | **No change** — already reads copies |
| `Collection.jsx:230` `touchedAt` | entry `addedAt`, goal `createdAt`, copy `addedAt` | **No change** — a filed copy's recency already comes from `copy.addedAt` |
| `CollectorShell.jsx:112,546` tab count | `binders.length` — **records, not cards** | **No change**, and deliberately so |
| `Binder.jsx:83-86`, `CardSpecification.jsx:314,348` archive filters | `binders.archivedAt` | **No change** |
| `Goals.jsx` | **zero binder reads** | none |
| `client/tp/**` | **zero** — partners receive `[]` | none |
| `domain/collector-view.js` | zero binder reads (its `binderId` is a copy id) | none |

**[R] Two must change in the same batch as the field: `countOf` and the binder
view.** That is the whole of the coupling — it is not a coupling to Goals.

---

## 16. Validation invariants

**[R] Minimum rules, inside the existing copies loop in `domain/metyet-world.js`,
every one guarded by absence:**

```js
if (!blank(b.filedIn)) {
  const bd = ref(binders, b.filedIn, `${path}.filedIn`, "binder", who);
  if (bd && bd.collectorId !== b.collectorId) {
    ownerMismatch(`${path}.filedIn`,
      `${who} is filed in binder "${b.filedIn}", which belongs to "${bd.collectorId}".`);
  }
}
```

following the existing `ref()` template (`:142-148`) and the owner-match at
`:425-427`. The `binders` index is currently built at `:386`, *after* the copies
loop, and would need hoisting.

| Rule | Where it belongs |
|---|---|
| binder exists | `validateWorld` — durable truth |
| same-Collector ownership | `validateWorld` — durable truth |
| absent is legal | `validateWorld` — **mandatory** |
| archived binder | **neither.** `archivedAt` is a reversible state a person controls; refusing it would make archiving a binder invalidate every copy in it |
| deleted binder | `validateWorld` detects the dangling reference; the *guarantee* is `deleteBinder` (§11) |
| no state dependency, no card-level aggregate | **neither** — the rule the last batch withdrew, and it stays withdrawn |
| seat and ownership at write time | the **command** — `refuse(R.notOwner)`, the shape at `metyet-commands.js:1104,1133,1157` |

**[F] Would any of these invalidate an existing stored world? No — verified by
probe.** `validateWorld` returned `{ok:true}` for a world whose copy carried a
dangling `binderId`, and for one carrying another Collector's binder id: the
field is entirely inert today, and there is no unknown-key rule. Since no stored
row has `filedIn`, absence-guarded rules invalidate nothing.

**[F] The trap, named explicitly, because this repository has hit it three
times:** *requiring* the field is what would turn every stored world into a 500
on the next command. `metyet-world.js:329-336` says so about `keeping` in those
words. The owner-match rule is the one that is vacuous now and becomes reachable
later — it should ship with the field, not after it.

---

## 17. Rollback analysis

[F] The repository writes whole collections from the in-memory world and puts
anything that is not a declared column into `attrs`, so an additive field needs
**no migration at all** until it becomes a column.

| Stage | Cost to undo |
|---|---|
| field added, unused | ~zero — delete the code; any written key is inert on load and never reached a partner (the allow-list is a whitelist) |
| field written and read | cheap — stop reading it; screens fall back to entries. Optional cleanup: `update metyet.collector_copies set attrs = attrs - 'filedIn';` |
| read models union both | cheap — revert the two read models |
| **legacy rows migrated** | **expensive and lossy** for classes (b), (d), (e), (f), (g) — the reverse is a reconstruction, not a restore, unless a pre-migration snapshot exists |
| **`binder_entries` dropped** | **the one-way door.** `migrate.js` is forward-only by design; the table is the only record of Goal-only and curated-unowned membership |

**[R] Under recommendation E the last two stages never happen**, so the one-way
door is never approached. If the product later decides otherwise: run the §7
census first and keep its output; **rename** `binder_entries` rather than
dropping it; and gate the destructive step on the census.

---

## 18. Scenarios A–H

**A. One copy, one Goal, one legacy entry.** [R] **Neither inherits it, and that
is the answer.** The entry says the *card* is filed; it has never said which
object. Under E it stays exactly what it is and keeps meaning exactly that. If
the Collector later files the copy, that is a second, different fact. Assuming
the copy inherits it would be inventing intent; assuming the Goal does would be
the same error in the other direction.

**B. Three copies (A PC, B and C Trade/Sell) and one legacy entry.** [F] The
entry carries `{binderId, canonicalCardId, addedAt}` and nothing else — no grade,
no cert, no disposition. **Nothing in the row can identify which of the three was
meant, because at the time it was written the product did not have the concept.**
`0013:29-32` says so directly: three copies, one place the card belongs. Class
(b): the Collector must choose, or the entry stays a card-level fact.

**C. A copy with no legacy entry.** [R] `filedIn` absent → **intentionally
unfiled**, unambiguously, because under E nothing is ever migrated in and absence
has only one meaning. "Not migrated" is not a state that exists.

**D. A new copy created after the field exists but before any legacy work.** [R]
**`copy.filedIn` is authoritative from the moment the field exists** — absent
until the person files it. There is no interim rule, because there is no interim.

**E. New copy + binder ticked in one CardSpecification Save.** [F] Today the
plan is `make-binder → record-copy → file`, and `file` carries the binder id and
the **canonical card**, so the tick files the *card*. A copy-filing step for a
copy minted in the same Save would carry `copyId: null`, and `adopt` cannot
substitute it because `steps` is frozen before the loop. **[R] First batch: the
panel is unchanged, the tick keeps filing the card, and copy filing happens from
the copy row.** When the panel takes it on, defer a new copy's filing to the next
Save — the `make-binder` precedent — unless `commit`'s plan-once contract is
deliberately changed.

**F. A binder archived while copies are filed in it.** [R] Their `filedIn` is
**unchanged** — archiving touches nothing inside. They read as *not actively
filed* wherever the product already makes that distinction, via a join on
`archivedAt`, exactly as `filedSomewhereActive` does today. Unarchiving returns
the same binder holding the same copies.

**G. Future Binder Delete.** [R] `deleteBinder` removes the binder, clears
`filedIn` on every copy naming it, and drops its entries — **in one state
transition**, because the repository writes what the world says and the FK cannot
help (§11). The copies survive untouched and become unfiled; `validateWorld`
would catch any implementation that forgot.

**H. The same card in several legacy binders.** [F] **Possible today** — nothing
caps it; the unique index is per `(binder_id, canonical_card_id)`, so one card in
three binders is three legal rows, and `CardSpecification.jsx:17` advertises it.
[R] Under E there is no migration, so no impact: the card stays filed in all
three, as a card. Had the brief's replacement model been taken, this class would
have been unrepresentable — one copy cannot have three homes — and would have
forced either a data loss or a `filedIn` that is not single-valued.

---

## 19. Risks and contradictions

**19.1 — The brief's premise does not survive the repository, and this is the
headline.** [F/R] "Introduce object-level membership for CollectorCopy without
competing authorities" presumes the copy-level home can eventually *be* the
answer. Classes (e), (f) and (g) say it cannot, and (f) — a binder holding a card
the Collector neither owns nor wants — is documented as the state a binder starts
in and was deliberately restored one batch ago. **Retiring `binder_entries` is a
product reversal, not a migration.** Surfaced, not solved.

**19.2 — The `binderId` name is taken.** [F] Detailed in §4. Using it would give
one field name two meanings on one row type, in a codebase where
`collectorCopyStatus(binderId, …)` already takes a copy id. Use `filedIn`.

**19.3 — The stop condition, answered precisely.** [F] A CollectorCopy-only
change **can** be separated from Goal Binder membership — Goals keep using
`binder_entries` and nothing forces them to move. It **cannot** be separated from
two read models: `Binder.jsx`'s `countOf` and `Collection.jsx`'s binder view must
union in the same batch, or a binder holding three filed copies reads "0 cards".
That is a durable fact recorded and then invisible — the C2.1 failure exactly.

**19.4 — A screen will have to say what "unfiled" means.** [R] Three conditions
(absent, filed-and-active, filed-and-archived) and two answers most screens want.
Not a blocker; decide it once and say the same thing everywhere.

**19.5 — Legacy `cardId`-only copies.** [F] `0011:50` kept the legacy column, so
a copy naming only `card_id` is invisible to every canonical-card join, including
the census. It would also be unreachable by any card-keyed filing UI. Unreachable
in production data as far as the repository can show, but it must be counted
before anything destructive.

---

## 20. Recommended implementation sequence

Each step is independently reviewable and independently revertable. **None of it
is executed here.**

**Batch 1 — the field, its rules, and the two read models.**
1. `filedIn` as an optional `attrs` key on CollectorCopy. **No migration, no
   column, no backfill.**
2. `validateWorld`: binder exists, same-Collector ownership, absence legal — all
   absence-guarded; hoist the `binders` index above the copies loop.
3. `setCollectorCopyFiledIn({copyId, filedIn})`, exposed. Refuses on seat and
   ownership only; no state dependency.
4. The two read models union: `Binder.jsx` `countOf`, `Collection.jsx`'s binder
   view. Nothing else changes.
5. One surface to use it: the copy row on Your Cards. **Not CardSpecification.**
6. Tests: the field round-trips through `attrs`; a move is one call; unfiling is
   `null`; a foreign binder is refused; an archived binder keeps its copies; a
   binder with three filed copies and no entries reads "3"; and the four-state
   suite's shape pin is re-pinned to the new row shape deliberately, with the
   reason.

**Batch 2 — Goals**, the same shape, if the product wants Goal homes.

**Batch 3 — `deleteBinder`**, clearing `filedIn` and dropping entries in one
transition (§11), with a test that copies survive and become unfiled.

**Only if the product reverses §19.1 — the census (§7), then a rename of
`binder_entries`, never a drop.**

---

## 21. Stop point for the first implementation batch

**Stop after Batch 1.** Specifically: stop when a Collector can put a specific
copy in a binder, move it, and take it out; when that copy appears in that
binder's count and contents; when `validateWorld` catches a dangling or foreign
home; and when no stored world has been touched.

**Do not, in that batch:** add a home to Goals; migrate or drop a single
`binder_entries` row; change `addBinderEntry`/`removeBinderEntry`; change
CardSpecification's answer model; add `filedAt`; implement Move/Delete of a
binder; remove Archive; implement search; change Goal cardinality; or expose any
transaction command.

**The exact condition for ever deleting `binder_entries`** [R]: not a count and
not a migration gate, but a product decision — **that a Binder may no longer hold
a card the Collector neither owns nor wants.** Until that decision is made, the
table is not transitional. It is the only record of curation, and it should stop
being described as temporary.
