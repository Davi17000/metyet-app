-- ============================================================================
-- 0015 — A CONVERSATION MAY BELONG TO A DEAL (Milestone 2D.1)
--
-- Until now every conversation was keyed by Collector + Trusted Partner + a
-- card from the LEGACY catalogue (`card_id`, NOT NULL, references
-- `catalog_cards`). Production's legacy catalogue is empty by design, and a
-- canonical deal names its card canonically, so no current deal could have a
-- conversation at all — and two deals between the same two people on the same
-- card would have had to share one.
--
-- WHAT CHANGES. A second kind of thread: one per canonical opportunity, keyed
-- server-side as 'opp::' || opportunity_id, with no legacy card. So:
--
--   1. `card_id` may be NULL — a deal thread names no legacy card.
--   2. A thread must name a legacy card OR be its deal's own thread: with no
--      card, `opportunity_id` is required and `key` is exactly
--      'opp::' || opportunity_id. With `conversations_key_key` (unique), that
--      is ONE conversation per deal, enforced by the database.
--
-- WHAT DOES NOT. Existing rows all name a card, so they satisfy the new check
-- unchanged; nothing is moved or rewritten. The card foreign key still applies
-- whenever a card is named. `conversations_opportunity_fk` (0001) still makes
-- a deal-linked thread's two participants exactly the deal's own — so a deal
-- thread cannot be stored between anybody else. `conversation_entries` is
-- untouched: messages are entries, ordered by `ord` as every entry is.
-- ============================================================================

alter table metyet.conversations alter column card_id drop not null;

alter table metyet.conversations add constraint conversations_card_or_deal check (
  card_id is not null
  or (opportunity_id is not null and key = 'opp::' || opportunity_id)
);
