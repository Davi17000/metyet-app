-- ============================================================================
-- 0008 — A GOAL NAMES A CANONICAL CARD (Phase 5 Batch 7)
--
-- Batch 6 moved supply. This moves demand, and with it the other half of the
-- thing MetYet exists to do: a Trusted Partner says "I have one of these", a
-- Collector says "I want one of those", and both of them are now pointing at
-- the same catalog rather than at two descriptions that happen to read alike.
--
-- WHAT A GOAL IS. One Collector saying, explicitly, that they want one exact
-- card and that they want their Trusted Partner to know it. Not a search they
-- ran, not a filter they set, not a card they looked at twice. Nothing in this
-- schema or anywhere near it infers one.
--
-- PRIMARY AND SECONDARY ARE INTENT, NOT IDENTITY. `tier` already carries them
-- and is already a generated column; a Collector moving a card from "keep an
-- eye out" to "actively hunting" changes what they mean, never which card they
-- mean. The card reference below does not move when the tier does.
--
-- WHY THE UNIQUE INDEX. `addGoal` has always refused to create a second Goal
-- for a card a Collector already wants, and that refusal is the product's, not
-- the database's — but demand that exists twice is demand a partner would be
-- shown twice, so the rule is worth holding in two places. `removeGoal` deletes
-- the row rather than marking it, so an ordinary unique index says exactly what
-- is meant: one live Goal per Collector per exact card. Different printings of
-- one card are different canonical cards and are not caught by it, which is
-- the point — wanting the 1st Edition and the Unlimited is wanting two things.
--
-- WHY `card_id` LOSES ITS NOT NULL, as in Batch 6: a Goal created from here on
-- names a canonical card and there is no legacy catalogue row for it to point
-- at. The old column and its foreign key stay, holding the demo's goals, and a
-- NULL satisfies a foreign key. validateWorld requires one reference and
-- refuses both.
--
-- WHAT THIS DOES NOT TOUCH. Binder copies, opportunities, trade rows and
-- conversations still carry a legacy `card_id`. Each moves with the batch that
-- rewrites the command that writes it. Nothing here is backfilled and no
-- canonical identity is guessed: production holds no goals.
-- ============================================================================

alter table metyet.goals
  add column canonical_card_id text;

alter table metyet.goals
  add constraint goals_canonical_card_fk
  foreign key (canonical_card_id)
  references metyet_catalog.canonical_cards (canonical_card_id)
  deferrable initially deferred;

alter table metyet.goals
  alter column card_id drop not null;

-- One live Goal per Collector per exact card. NULLs are distinct in a unique
-- index, so the demo's legacy goals are untouched by it.
create unique index goals_one_per_collector_card_idx
  on metyet.goals (collector_id, canonical_card_id);

-- "Who wants this card" is the question Batch 8 will ask of demand, and the
-- question a Collector's own list already asks of itself.
create index goals_canonical_card_idx
  on metyet.goals (canonical_card_id);
