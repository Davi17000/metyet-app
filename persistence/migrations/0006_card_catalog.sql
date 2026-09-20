-- ============================================================================
-- 0006 — THE CARD CATALOG, WHICH IS NOT PART OF THE WORLD (Phase 5 Batch 5)
--
-- Every table 0001 created holds something that HAPPENED: a partner registered,
-- a collector was invited, a copy was acquired, a deal moved. The canonical
-- world is that record, it is loaded whole under one advisory lock, it is
-- validated as one state, and every command rewrites what it touched.
--
-- A card catalog is none of those things. It is a reference work: eighteen
-- thousand printings that are true whether or not anybody in MetYet has ever
-- wanted one, that change when a set is released rather than when a person
-- acts, and that no command writes. Keeping it in `metyet` meant every command
-- and every read loaded the whole catalog under the world lock, and
-- `projectForActor` shipped all of it to every client on every view. That was
-- unremarkable for the eighty-four cards the demo seeds. It does not survive
-- contact with a real one.
--
-- So the catalog moves to its own schema, with its own lifecycle:
--   * nothing here is loaded by loadWorld or validated by validateWorld;
--   * nothing here is written by a command or under the world lock;
--   * reading it takes no lock at all.
--
-- WHAT THIS MIGRATION MOVES, AND WHY IT IS SAFE TO MOVE IT NOW. Production
-- starts empty — `server/cli.js` says so in as many words, "no demo data, no
-- example records". Nothing in this migration touches the `metyet` schema at
-- all: it ADDS a schema and changes nothing that exists, so it cannot break a
-- running deployment and needs no backfill. What happens to the legacy
-- catalog_cards table is stated at the foot of this file.
--
-- THE THREE LEVELS. An EXPANSION is one release with its own checklist. A CARD
-- CONTEXT is one line on that checklist — a number and a name — and is what a
-- person browses. A CANONICAL CARD is one independently collectible printing of
-- that line, and is what a Goal, an Inventory copy or a Binder entry points at
-- for ever. See domain/card-identity.js for why the split is where it is.
--
-- IDENTITY IS OPAQUE AND MINTED HERE. Every `*_id` below is a server-minted
-- token with no meaning: not a provider's id, not a hash of the card's
-- dimensions, not derived from anything that could be corrected later. The
-- `natural_key` columns exist so an import can ask "do I already have this?"
-- and are UNIQUE for that reason — but nothing outside this schema stores one,
-- because every segment of a natural key is a judgement MetYet made about
-- somebody else's data. A judgement that is corrected must leave the id alone.
-- ============================================================================

create schema if not exists metyet_catalog;

-- ------------------------------------------------------------- EXPANSIONS
-- One release with its own checklist and its own printed total. A subset that
-- prints its own checklist is one of these in its own right — a Trainer Gallery
-- numbers its cards TG01/30 and is not thirty extra lines on its parent set's
-- checklist.
--
-- `code` is MetYet's own short handle for a release. It is NOT a provider's set
-- id: a provider's set id reaches this schema only through a source mapping, so
-- that two providers naming one release differently is a mapping question and
-- never an identity question.
create table metyet_catalog.expansions (
  expansion_id  text        primary key,
  game          text        not null,
  code          text        not null,
  natural_key   text        not null,
  name          text        not null,
  series        text,
  release_date  text,
  -- The denominator a card prints, e.g. the 102 in 4/102. Descriptive only:
  -- secret rares legitimately exceed it (Dark Raichu is 83/82), so nothing
  -- validates a collector number against this.
  printed_total integer,
  created_at    timestamptz not null default now(),
  constraint expansions_natural_key_key unique (natural_key),
  constraint expansions_game_code_key   unique (game, code)
);

-- --------------------------------------------------------- CARD CONTEXTS
-- One checklist entry. The browse unit.
--
-- WHY `card_name` IS PART OF THE KEY. Celebrations: Classic Collection reprints
-- cards under their ORIGINAL numbering, so that one release contains four
-- different cards all numbered 15. Measured over the 18,210 printings this
-- repository already holds, (expansion, collector_number) collides exactly
-- there and (expansion, collector_number, card_name) collides nowhere.
--
-- `collector_number` IS TEXT AND IS NEVER PARSED. Real values include TG01,
-- H12, 182a, numbers past the printed total, and — in Unseen Forces, where the
-- Unown run is numbered by letter — `!` and `?`.
--
-- `discriminator` is reserved for the collision nobody has found yet. It
-- defaults to the empty string and participates in the key from today, so that
-- if one is ever needed it costs a data fix rather than re-minting every id.
--
-- Everything below the key is PRESENTATION. Artist, rarity, supertype and
-- Pokédex numbers make a card findable and legible; none of them identifies it,
-- and none appears in any key. `illustration_group_id` is reserved for a future
-- curated "other printings of this illustration" relationship and is null
-- throughout this batch: artwork is never upstream of a release.
create table metyet_catalog.card_contexts (
  card_context_id       text        primary key,
  expansion_id          text        not null,
  collector_number      text        not null,
  card_name             text        not null,
  discriminator         text        not null default '',
  natural_key           text        not null,
  artist                text,
  rarity                text,
  supertype             text,
  subtypes              jsonb       not null default '[]'::jsonb,
  pokedex_numbers       jsonb       not null default '[]'::jsonb,
  illustration_group_id text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint card_contexts_natural_key_key unique (natural_key),
  constraint card_contexts_expansion_fk foreign key (expansion_id)
    references metyet_catalog.expansions (expansion_id)
);

create index card_contexts_expansion_idx on metyet_catalog.card_contexts (expansion_id);
-- The three browse doorways the search design needs: by name, by set, by
-- artist. Lower-cased so a prefix search does not depend on how a source
-- capitalised a name.
create index card_contexts_name_idx   on metyet_catalog.card_contexts (lower(card_name));
create index card_contexts_artist_idx on metyet_catalog.card_contexts (lower(artist));

-- ------------------------------------------------------- CANONICAL CARDS
-- One independently collectible printing. What a Goal and an Inventory copy
-- reference, for ever.
--
-- FIVE DIMENSIONS, ALWAYS ALL FIVE. print_run, finish and language are supplied
-- by a source. `stamp` and `print_variation` are not supplied by ANY source
-- MetYet has evaluated, and are here anyway, at their defaults: a
-- prerelease-stamped card shares its release AND its collector number with the
-- standard printing, and a systematically corrected misprint shares everything,
-- so without these two columns those cards could never be told apart. Carrying
-- them from the first day is what makes adding them later ADD rows instead of
-- renumbering every card MetYet has minted.
--
-- THE VOCABULARY IS NOT A CHECK CONSTRAINT, deliberately. It lives in
-- domain/card-identity.js, which the repository consults before it writes and
-- the translation boundary consults before it decides a record is mappable. A
-- CHECK here would mean that recognising a collectible distinction the hobby
-- already recognises required a migration, and would put a second copy of the
-- vocabulary in a place no test reads. `status` IS constrained, because it is a
-- closed set this schema owns.
--
-- GRADE AND CONDITION ARE NOT HERE and never will be. They describe a physical
-- copy somebody holds, not which card it is. Images are here because they
-- differ per printing — a 1st Edition Shadowless Holofoil has its own picture —
-- but they are presentation and appear in no key.
create table metyet_catalog.canonical_cards (
  canonical_card_id text        primary key,
  card_context_id   text        not null,
  print_run         text        not null,
  finish            text        not null,
  language          text        not null,
  stamp             text        not null default 'none',
  print_variation   text        not null default 'standard',
  natural_key       text        not null,
  image_small       text,
  image_large       text,
  -- `withdrawn` means a source stopped listing it. It NEVER means deleted: a
  -- Goal may point at this row, and identity that disappears is not identity.
  status            text        not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint canonical_cards_natural_key_key unique (natural_key),
  constraint canonical_cards_status_check check (status in ('active', 'withdrawn')),
  constraint canonical_cards_context_fk foreign key (card_context_id)
    references metyet_catalog.card_contexts (card_context_id)
);

create index canonical_cards_context_idx on metyet_catalog.canonical_cards (card_context_id);

-- -------------------------------------------------------- SOURCE MAPPINGS
-- Where a canonical card came from, and nothing about what it means.
--
-- Several providers may map to one canonical card; one provider may describe a
-- card differently from another; a provider may rename a variant or vanish
-- entirely. None of that may reach a Goal, so all of it is confined here.
--
-- `status = 'quarantined'` IS A FIRST-CLASS STATE, not an error log. A source
-- record whose vocabulary MetYet cannot map keeps its raw payload and waits,
-- with `canonical_card_id` null — so it cannot be searched, cannot be matched
-- and cannot be wanted. The alternative is a record that quietly becomes
-- `unlimited` or `holofoil` because that was the nearest known value, which is
-- a durable wrong answer rather than a visible unanswered question.
--
-- `raw` IS BOUNDED, NOT THE WHOLE PAYLOAD. Enough to audit a translation — the
-- fields the adapter actually read, plus anything it could not map — and not a
-- second copy of a provider's catalog in MetYet's database. A full payload
-- would multiply the catalog's storage by the size of the largest provider's
-- schema for no audit value this does not already give. Secrets, API keys and
-- credentials are never written here.
create table metyet_catalog.source_mappings (
  source_mapping_id     text        primary key,
  provider              text        not null,
  provider_expansion_id text,
  provider_card_id      text        not null,
  provider_variant_key  text        not null default '',
  expansion_id          text,
  card_context_id       text,
  canonical_card_id     text,
  raw                   jsonb       not null default '{}'::jsonb,
  status                text        not null,
  quarantine_reason     text,
  first_seen_at         timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  constraint source_mappings_source_key
    unique (provider, provider_card_id, provider_variant_key),
  constraint source_mappings_status_check
    check (status in ('mapped', 'quarantined', 'withdrawn')),
  -- A mapped row names a canonical card; a quarantined one must not.
  constraint source_mappings_mapped_check check (
    (status = 'mapped' and canonical_card_id is not null)
    or (status <> 'mapped')),
  constraint source_mappings_quarantine_check check (
    (status = 'quarantined' and canonical_card_id is null)
    or (status <> 'quarantined')),
  constraint source_mappings_expansion_fk foreign key (expansion_id)
    references metyet_catalog.expansions (expansion_id),
  constraint source_mappings_context_fk foreign key (card_context_id)
    references metyet_catalog.card_contexts (card_context_id),
  constraint source_mappings_card_fk foreign key (canonical_card_id)
    references metyet_catalog.canonical_cards (canonical_card_id)
);

create index source_mappings_card_idx     on metyet_catalog.source_mappings (canonical_card_id);
create index source_mappings_status_idx   on metyet_catalog.source_mappings (status);

-- ============================================================================
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--
-- It does not drop metyet.catalog_cards, and it does not re-point the six
-- card_id foreign keys that reference it — goals, inventory_copies,
-- binder_copies, opportunities, opportunity_trade_refs and conversations.
--
-- That table is demo-era plumbing, and the new schema above is where production
-- card identity lives from now on. Nothing writes a canonical card except an
-- import: no command in the table touches this schema, and the card routes are
-- reads. The legacy `resolveCardIdentity` command still writes a legacy world
-- catalog row, and is deliberately left alone — a registration test asserts it
-- as current product behaviour, and replacing it is what re-pointing `addGoal`
-- and `addInventoryCopy` at a canonical card means.
--
-- Removing it belongs with the batch that re-points `addGoal` and
-- `addInventoryCopy` at a canonical card. Those commands resolve a cardId
-- against the world's own catalog today; dropping the table underneath them
-- without rewriting them would turn a command that refuses because the catalog
-- is empty into a command that cannot run at all, which is a product change
-- this batch has no business making. The removal is one `drop table` and six
-- constraint drops when that batch arrives, on a table that still has no rows.
-- ============================================================================
