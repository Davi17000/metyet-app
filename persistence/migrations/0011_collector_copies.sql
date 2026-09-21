-- ============================================================================
-- 0011 — A COLLECTOR'S OWN CARDS, UNDER THEIR OWN NAME (Phase 5 C2)
--
-- `binder_copies` has never been a binder. It is a Collector's own physical
-- card, photographed and offered to their Trusted Partners as trade supply —
-- which is the same kind of thing as `inventory_copies`, owned by the other
-- seat. The word "Binder" is now wanted for something else entirely: a named
-- organisational grouping a Collector makes ("Mudkip Collection"), whose
-- membership points at a canonical card. That concept is C3's and does not
-- exist yet. This migration gets the word out of its way.
--
-- THREE THINGS HAPPEN HERE, AND ONLY THESE THREE.
--
-- 1. THE TABLE IS RENAMED. Foreign keys follow a renamed table automatically,
--    so `interests.binder_id` and `opportunity_trade_refs.binder_id` keep
--    pointing at exactly the rows they pointed at. Those two COLUMN names stay
--    as they are: they belong to the interest model and the trade package, and
--    renaming a column inside the trade package is the trade batch's work, not
--    this one's. They are legacy naming debt and are written down as such in
--    domain/README.md rather than left for somebody to rediscover.
--
-- 2. A COPY NAMES A CANONICAL CARD, on the rule Batch 6 gave inventory, Batch 7
--    gave goals and Batch 8 gave opportunities. Until now a Collector's copy
--    could only name a row in the legacy `catalog_cards` table — which is empty
--    in production, so a Collector could not record owning anything at all. The
--    old column and its foreign key stay, holding the demo's copies, and a NULL
--    satisfies a foreign key. validateWorld requires one reference and refuses
--    both.
--
-- 3. NOTHING ELSE. `offered` — whether the Collector is currently willing to
--    part with the copy — is a fact about the record and lives in `attrs` with
--    every other copy fact, so it costs no column. Nothing is backfilled here;
--    the world repository gives existing rows their `offered` value when it
--    next writes them, and the domain decides what that value is. See
--    domain/metyet-commands.js.
--
-- WHY `offered` IS NOT A STATUS COLUMN. There is already a status, and it is
-- derived: available / reserved / committed / traded, read from the
-- opportunities by `collectorCopyStatus`. That says what a DEAL has done to a
-- copy. `offered` says what its OWNER is willing to do with it, which is a
-- different question with a different answer — a copy can be owned and not
-- offered, and a copy can be offered and already committed. Storing the second
-- one next to the first, as a column, would invite somebody to write the
-- derived one down too.
-- ============================================================================

alter table metyet.binder_copies rename to collector_copies;

alter table metyet.collector_copies
  add column canonical_card_id text;

alter table metyet.collector_copies
  add constraint collector_copies_canonical_card_fk
  foreign key (canonical_card_id)
  references metyet_catalog.canonical_cards (canonical_card_id)
  deferrable initially deferred;

alter table metyet.collector_copies
  alter column card_id drop not null;

-- "Which of a Collector's own cards are this card" — the question a named
-- Binder will ask of it, and the one a Collector's own shelf already asks.
create index collector_copies_canonical_card_idx
  on metyet.collector_copies (canonical_card_id);

-- ============================================================================
-- AND ONE CONSEQUENCE, WHICH IS NOT A FOURTH THING BUT THE FIRST THREE WORKING.
--
-- A trade package's rows point at a card through `opportunity_trade_refs`, and
-- `card_id` there was NOT NULL with a foreign key into the legacy
-- `catalog_cards`. A Collector's copy recorded in production names a CANONICAL
-- card and has no legacy one — so without this, a production copy could be
-- owned and offered and never actually put into a trade, which would make the
-- concept above production-capable in name only.
--
-- This is the same additive move Batch 6 made for inventory, Batch 7 for goals
-- and Batch 8 for opportunities: a second nullable column, a foreign key, and
-- the old NOT NULL dropped. validateWorld requires exactly one reference and
-- refuses both, and additionally requires that the row names the same card as
-- the copy it carries. The column is NOT renamed and `binder_id` beside it is
-- NOT renamed: that is the trade batch's work and is written down as debt in
-- domain/README.md.
-- ============================================================================

alter table metyet.opportunity_trade_refs
  add column canonical_card_id text;

alter table metyet.opportunity_trade_refs
  add constraint opportunity_trade_refs_canonical_card_fk
  foreign key (canonical_card_id)
  references metyet_catalog.canonical_cards (canonical_card_id)
  deferrable initially deferred;

alter table metyet.opportunity_trade_refs
  alter column card_id drop not null;

create index opportunity_trade_refs_canonical_card_idx
  on metyet.opportunity_trade_refs (canonical_card_id);
