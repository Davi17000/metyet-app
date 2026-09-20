-- ============================================================================
-- 0007 — AN INVENTORY COPY NAMES A CANONICAL CARD (Phase 5 Batch 6)
--
-- Batch 5 built the catalog and deliberately wired nothing to it: no product
-- record pointed at a canonical card, because moving one meant moving the
-- command that writes it, and that is a batch of its own. This is that batch,
-- for exactly one write path — a Trusted Partner's own inventory.
--
-- WHAT A COPY IS. One physical card somebody actually has. Which card it IS is
-- the canonical card's business — release, collector number, name, print run,
-- finish, language. What is true about THIS one is the copy's: what grade it
-- carries, what condition it is in if it is raw, its certificate, what it cost,
-- what it is being asked for, when it arrived, and the photographs of it.
--
-- Batch 5 moved grade and condition out of card identity, which is what makes
-- that line drawable at all: a PSA 9 and a PSA 10 of one printing are the same
-- canonical card and two different copies, and so are two raw copies in
-- different condition. Before Batch 5 they were different CARDS.
--
-- WHY `card_id` LOSES ITS NOT NULL. A copy created from here on names a
-- canonical card and nothing else — there is no legacy catalog row for it to
-- point at, because production has no legacy catalog and never will again. The
-- old column and its foreign key stay exactly as they are, holding the demo's
-- copies, and a NULL satisfies a foreign key, so nothing about the old path
-- changes. Which of the two a copy carries is checked by validateWorld, which
-- requires one and only one.
--
-- WHY THE NEW REFERENCE IS A REAL FOREIGN KEY. A copy that names a card nobody
-- has is not a copy of anything. The constraint is DEFERRABLE INITIALLY
-- DEFERRED like every other reference out of the world, because a world is
-- saved as one transaction and checked as one state at COMMIT — and the cards
-- it points at were written by an import, long before and in another schema, so
-- there is nothing to order against.
--
-- WHAT THIS MIGRATION DOES NOT TOUCH. Goals, binder copies, opportunities,
-- trade rows and conversations all still carry a legacy `card_id`. Each of them
-- moves with the batch that rewrites the command that writes it — Collector
-- Goals next. Moving them here would mean rewriting commands this batch has no
-- business in, which is the same reasoning that kept Batch 5 additive.
-- ============================================================================

alter table metyet.inventory_copies
  add column canonical_card_id text;

alter table metyet.inventory_copies
  add constraint inventory_copies_canonical_card_fk
  foreign key (canonical_card_id)
  references metyet_catalog.canonical_cards (canonical_card_id)
  deferrable initially deferred;

-- A copy now names its card through one column or the other, so neither can be
-- mandatory in the schema. Which one is required, and that exactly one is, is a
-- domain rule and lives in validateWorld.
alter table metyet.inventory_copies
  alter column card_id drop not null;

-- "Every copy of this card" is the question inventory display asks, and the
-- question a future opportunity will ask of supply.
create index inventory_copies_canonical_card_idx
  on metyet.inventory_copies (canonical_card_id);
