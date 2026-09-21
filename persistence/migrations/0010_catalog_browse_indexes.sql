-- ============================================================================
-- 0010 — THE CATALOG BECOMES BROWSABLE (Phase 5 C1)
--
-- Batch 5 built the catalog to be READ BY ID: a Goal or a Copy names a card,
-- and the card is fetched. The three columns it indexed — name, artist,
-- expansion — were the three a text search needed, and that was the search the
-- product had.
--
-- This batch gives people a way in that is not a text box. The doorways are the
-- Pokémon, the set and the artist, and two of those already have what they need.
-- The third does not: `pokedex_numbers` has been stored on every card context
-- since Batch 5 and returned to every caller since Batch 5, and nothing has ever
-- been able to ask a question of it. A jsonb array with no index is a column you
-- can read and cannot search.
--
-- WHY GIN AND WHY `jsonb_path_ops`. The only question anybody asks of this
-- column is containment — "which contexts include this number" — and
-- jsonb_path_ops indexes exactly that operator and nothing else, which makes it
-- smaller and faster than the default opclass at the cost of the queries nobody
-- is asking. One card context can carry several numbers, which is the point: a
-- card showing two Pokémon is found by either of them.
--
-- WHY THE EXPANSION GETS A NAME INDEX. A person browsing sets types "Base", not
-- an opaque expansion id, and until now the id was the only thing that could be
-- asked for. The lower() expression matches the predicate the repository uses,
-- so the index is the one the query actually takes.
--
-- WHAT IS NOT HERE. No index for substring card-name search, deliberately. A
-- leading-wildcard LIKE cannot use a btree, and the honest fix is pg_trgm —
-- which is an extension, and an extension is a deployment decision, not an
-- index. At this catalog's size a scan of the contexts table is a few
-- milliseconds and the ceiling on a page is a hundred rows. If the catalog ever
-- outgrows that, the answer is a trigram index in its own migration, with the
-- extension enabled deliberately.
--
-- Nothing here changes a table, a column, a constraint or a row. Indexes only.
-- ============================================================================

-- "Which cards are this Pokémon" — the doorway that had a column and no door.
create index card_contexts_pokedex_idx
  on metyet_catalog.card_contexts
  using gin (pokedex_numbers jsonb_path_ops);

-- "Which set is this" answered by the name a person would type, and by the code
-- printed on the card.
create index expansions_name_idx on metyet_catalog.expansions (lower(name));
create index expansions_code_idx on metyet_catalog.expansions (lower(code));
