-- ============================================================================
-- 0014 — A BINDER IS THE HOME OF AN OBJECT, NOT OF A CARD (Phase 5, Batch 3A)
--
-- 0013 said the opposite, in bold, and gave its reasons:
--
--   "MEMBERSHIP POINTS AT THE CANONICAL CARD, NOT AT A GOAL AND NOT AT A COPY.
--    This is the whole design and it is load-bearing."
--
-- The reasons were real and this file answers both of them. The first was that
-- `removeCollectorCopy` deletes, so a copy-named membership would be destroyed
-- by a sale and "organising would be collateral damage of a transaction". That
-- is now the correct outcome rather than the hazard: a membership is THAT
-- COPY'S home, and when the copy leaves the Collector's hands there is no
-- object left to have one. Nothing else moves — the Goal's home, the sibling
-- copies' homes and every other card in the binder are untouched. The second
-- was that one card covers three copies for free. That was the compromise, not
-- the feature: a Collector who keeps one copy and offers another has two
-- things that may belong in two different places, and one row could not say so.
--
-- WHAT 0013 ALREADY KNEW. Its own closing note called the card-level row
-- transitional, and `metyet-commands.js` says it plainer: "three actionable
-- objects share one row, which is why the row is on its way to naming the
-- object instead. Until it does, nothing here pretends it already names one."
-- This is that row.
--
-- A NEW TABLE, AND `binder_entries` IS NOT TOUCHED.
--
-- The obvious migration is to widen `binder_entries` — nullable goal and copy
-- columns beside the card column, a three-way check, partial unique indexes.
-- It was designed, applied to a real database and driven through the real
-- repository before this file was written, and it failed three ways:
--
--   1. `binder_entries.ord` is its PRIMARY KEY and it is the record's position
--      in a JavaScript array, recomputed on every save. Moving a membership
--      reorders the array, so the repository's one batched
--      `insert … on conflict (ord) do update` renumbers rows as it goes, and a
--      non-deferrable unique index sees a transient duplicate mid-statement.
--      A Collector moving one Goal from one binder to another got a 503.
--   2. Nullable references belong in `mirrors`, not `fields` (see
--      `world-repository.js`), and as fields they would have added `goalId:
--      null` to every legacy record and sent a whitespace id to the foreign key
--      as a 500 rather than a refusal.
--   3. Rolling the code back while the migration stayed applied left old builds
--      unable to load ANY world, because a row with a null card id fails the
--      validator rule that every entry names a canonical card. `loadWorld` runs
--      on every command, so the first filing would have taken the product down
--      for everyone until the code went forward again.
--
-- A separate table has none of those. It carries its own minted id, so nothing
-- is positional and nothing renumbers. Its columns are nullable by design and
-- are mirrors from the start. And a build that has never heard of it simply
-- does not read it: `validateWorld` tolerates a collection it does not know, so
-- the memberships go quiet and every other fact in the world loads exactly as
-- before. That property is why this is a CREATE and not an ALTER.
--
-- READING IS ONLY HALF OF A ROLLBACK, THOUGH, AND THIS FILE FIRST GOT IT WRONG.
-- The paragraph above was all it said, and an adversarial pass on the finished
-- batch found the other half. A rolled-back build does not run the cascade in
-- `removeGoal`, so with these foreign keys as NO ACTION the row stayed behind
-- and the DELETE on `goals` was refused at COMMIT, 500 rather than refusal,
-- every time, until the code went forward again. Measured, not reasoned about:
--
--   DELETE FAILED: update or delete on table "goals" violates foreign key
--   constraint "binder_memberships_goal_fk" on table "binder_memberships"
--
-- That is what `on delete cascade` on the two OBJECT keys is for, and it is the
-- only reason it is here. See the next paragraph.
--
-- UNIQUENESS IS DEFERRABLE, AND IT IS THE BELT RATHER THAN THE BRACES.
-- `unique (goal_id) deferrable initially deferred` is checked once at COMMIT
-- rather than row by row inside the statement, so it survives any order the
-- repository writes in. But the thing that actually removes finding (1) is the
-- MINTED ID above: this table's primary key is stable, so a reordered array
-- addresses the same rows by the same keys and no transient duplicate ever
-- exists to trip over. Measured honestly, a non-deferrable partial index would
-- pass every test in this batch. It is deferrable anyway because it costs
-- nothing, because NULLs are already distinct in a unique constraint so the
-- partial clause would buy only index size, and because the rule should keep
-- holding if anything ever reintroduces positional keying here.
--
-- EXACTLY ONE OBJECT, AS AN XOR. `(a is not null) <> (b is not null)` is true
-- for exactly one of the two and false for both or neither, which is the rule
-- written as the rule.
--
-- `ON DELETE CASCADE` ON THE OBJECT KEYS, AND NOWHERE ELSE. This is the first
-- `on delete` in the schema and it did not arrive by accident: it is the
-- rollback property above, written where a build cannot roll back past it.
-- `removeGoal` and `removeCollectorCopy` still remove the membership in the
-- same command, so the decision is visible in the domain and a reader of
-- `metyet-commands.js` never has to know this clause exists. The clause is what
-- holds when the code running is not that code. The semantics agree with the
-- command exactly — a membership is THAT object's home, and an object that no
-- longer exists cannot have one — so there is no state in which the two
-- disagree about what should happen.
--
-- The BINDER key stays NO ACTION, deliberately. Nothing deletes a binder today
-- and nothing in this batch does; if a delete ever arrives it must be a visible
-- decision about what happens to the filings inside, not a silent cascade that
-- discards a Collector's organising as a side effect of tidying up.
--
-- NO COMPOSITE OWNER FOREIGN KEY YET. A binder and the object filed in it must
-- belong to the same Collector, and the schema has the shape for it —
-- `opportunity_trade_refs` carries a redundant `collector_id` and a foreign key
-- on the pair. But `binders` and `goals` are keyed on `id` alone today, so two
-- new unique keys would be needed first. The command refuses a cross-owner pair
-- and `validateWorld` refuses a world containing one; the database joining them
-- is a later, additive improvement and not a condition of this one.
--
-- NOTHING IS BACKFILLED, MAPPED OR READ. No existing row is touched, and no
-- legacy card-level row is converted into a membership — not even where exactly
-- one Goal or one copy could be the candidate. That row records an act of
-- filing a CARD; nothing on it records what caused it, and one-Goal-per-card is
-- a rule the command keeps and the database does not, so "only one candidate"
-- is a fact about today rather than about what somebody meant. Those rows stay
-- exactly as they are until their owner says.
-- ============================================================================

create table metyet.binder_memberships (
  id                text    primary key,
  ord               integer not null,
  binder_id         text    not null,
  goal_id           text    null,
  collector_copy_id text    null,
  -- filedAt, and the mirror keys `goalId` / `collectorCopyId` — a nullable
  -- reference is a MIRROR (see `world-repository.js`), which means the column
  -- and the attrs key must agree. A row written with `goal_id` set and no
  -- `goalId` in `attrs` is reference drift, and reference drift makes the whole
  -- world unloadable rather than one row wrong. This comment is the only
  -- in-repo statement of the shape, so it says both halves.
  attrs             jsonb   not null,

  constraint binder_memberships_names_one_object check (
    (goal_id is not null) <> (collector_copy_id is not null)
  ),

  constraint binder_memberships_binder_fk foreign key (binder_id)
    references metyet.binders (id) deferrable initially deferred,

  constraint binder_memberships_goal_fk foreign key (goal_id)
    references metyet.goals (id) on delete cascade deferrable initially deferred,

  constraint binder_memberships_copy_fk foreign key (collector_copy_id)
    references metyet.collector_copies (id) on delete cascade deferrable initially deferred,

  constraint binder_memberships_one_home_per_goal
    unique (goal_id) deferrable initially deferred,

  constraint binder_memberships_one_home_per_copy
    unique (collector_copy_id) deferrable initially deferred
);

create index binder_memberships_binder_idx
  on metyet.binder_memberships (binder_id);
