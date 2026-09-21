-- ============================================================================
-- 0013 — WHERE A CARD BELONGS (Phase 5 C3.1)
--
-- A Binder is a Collector's own named grouping of canonical cards: "Mudkip
-- Collection", "Base Set", "Cards I like the art of". It is the first thing
-- MetYet has ever stored about how a Collector THINKS about their cards, as
-- distinct from what they want, what they own, or what they will part with.
--
-- FOUR DURABLE FACTS, AND THIS IS THE FOURTH:
--
--   Binder        this card belongs here                ← new
--   Goal          I want this card
--   CollectorCopy I own this physical copy
--   offered       I am willing to trade or sell it
--
-- They are independent on purpose. Organising a card says nothing about wanting
-- it, owning it or offering it, and none of those says anything about where it
-- belongs. A Binder entry whose card the Collector neither wants nor owns is
-- perfectly valid — that is curation, which is what a binder is for.
--
-- MEMBERSHIP POINTS AT THE CANONICAL CARD, NOT AT A GOAL AND NOT AT A COPY.
-- This is the whole design and it is load-bearing. `removeCollectorCopy`
-- deletes a copy and cascades its interests; if membership named a copy,
-- SELLING A CARD WOULD SILENTLY DELETE ITS PLACE IN THE BINDER, and organising
-- would be collateral damage of a transaction. If membership named a Goal, then
-- satisfying the goal would do the same. The canonical card is the only one of
-- the three that survives every transition the product supports, which is
-- exactly what "where this card belongs" has to mean.
--
-- It also answers the copies question for free: a Collector who owns a Raw NM,
-- a PSA 9 and a PSA 10 of one card has three physical copies and ONE place that
-- card belongs. Organisation is per card, not per object.
--
-- WHAT IS DELIBERATELY ABSENT. No description, no cover image, no ordering, no
-- sharing or visibility flag, no tags, no default state, no Goal or copy or
-- trade state, no counts, no analytics. A Binder is a name and a set of cards.
-- Anything else is a field somebody would have to fill in before the product
-- has told us it is worth asking for.
--
-- THERE IS NO SYSTEM "TRADE BINDER" HERE AND THERE WILL NOT BE ONE. A trade
-- view is `collector_copies` where `offered` is true — a read over a fact that
-- already exists. Storing it as a Binder would be a second source of truth for
-- a boolean, and the two would disagree the first time `setCollectorCopyOffered`
-- ran without a matching membership write.
--
-- ---------------------------------------------------------------------------
-- THE NAME `binder_id` ALREADY MEANS SOMETHING ELSE IN THIS DATABASE.
--
-- `interests.binder_id` and `opportunity_trade_refs.binder_id` are LEGACY and
-- name a COLLECTOR COPY — they predate C2's rename of `binder_copies` to
-- `collector_copies` and were left alone because renaming a column inside the
-- trade package is the trade batch's work. They have nothing to do with the
-- table below.
--
-- `binder_entries.binder_id` is the one place in the schema where that column
-- name genuinely names a Binder. The collision is real, it is confusing, and it
-- is written down here and in domain/README.md so that nobody joins the two by
-- accident. C3.1 does not rename the legacy columns; that is still the trade
-- batch's work.
-- ---------------------------------------------------------------------------
--
-- NO BACKFILL, AND NO DEFAULT BINDER. Existing Collectors have zero Binders,
-- which is the correct and complete answer — a person who has not organised
-- anything has not organised anything. Inventing a "My Collection" for everyone
-- would be the product deciding something on their behalf, and (the C2.1
-- lesson) an absence that genuinely means "none" must not be filled in.
-- ============================================================================

create table metyet.binders (
  id           text    primary key,
  ord          integer not null,
  collector_id text    not null,
  -- name, createdAt, archivedAt. Everything that is not identity or a foreign
  -- key lives in attrs, as it does for every other record in this schema.
  attrs        jsonb   not null,
  constraint binders_collector_fk foreign key (collector_id)
    references metyet.collectors (id) deferrable initially deferred
);

create index binders_collector_idx on metyet.binders (collector_id);

-- A Binder is a SET of cards, not a list of events: `ord` is the repository's
-- positional key, exactly as it is for `interests`, `preferences` and
-- `relationships`, which likewise carry no domain id of their own.
create table metyet.binder_entries (
  ord               integer primary key,
  binder_id         text    not null,
  canonical_card_id text    not null,
  attrs             jsonb   not null,     -- addedAt
  constraint binder_entries_binder_fk foreign key (binder_id)
    references metyet.binders (id) deferrable initially deferred,
  -- The canonical card, in the catalog schema. A Binder cannot organise a card
  -- that does not exist, and this is the same authoritative boundary a Goal, an
  -- InventoryCopy and a CollectorCopy each name their card across.
  constraint binder_entries_canonical_card_fk foreign key (canonical_card_id)
    references metyet_catalog.canonical_cards (canonical_card_id) deferrable initially deferred
);

-- ONE MEMBERSHIP PER CARD PER BINDER. Adding a card you already filed is not an
-- error a person should be shown; it is a no-op, and the command makes it one.
-- This index is what makes that true even if a world is constructed around the
-- command path.
create unique index binder_entries_one_per_card_idx
  on metyet.binder_entries (binder_id, canonical_card_id);

create index binder_entries_canonical_card_idx
  on metyet.binder_entries (canonical_card_id);
