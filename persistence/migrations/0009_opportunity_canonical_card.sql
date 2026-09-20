-- ============================================================================
-- 0009 — AN OPPORTUNITY NAMES A CANONICAL CARD (Phase 5 Batch 8)
--
-- Batch 6 moved supply, Batch 7 moved demand, and this moves the record that
-- exists when the two of them have been acted on. An Opportunity is not the
-- meeting of supply and demand — that is computed and is discussed below — it
-- is one Collector having made one Trusted Partner an offer on one physical
-- copy. It is the only thing in this schema a person has to start by hand.
--
-- WHY IT HAD TO MOVE, AND WHY IT COULD NOT WAIT. `startOpportunity` proves the
-- card the Goal names and the card the Copy names are the same card. Until
-- Batch 7 both were legacy catalogue rows and that comparison was sound. From
-- Batch 7 a Goal may name a canonical card and hold no `card_id` at all, and
-- the legacy comparison read two absent cards as two equal ones — so a canonical
-- copy of anything would have satisfied a canonical Goal for anything else. The
-- comparison is now made on canonical identity where there is canonical identity
-- and refuses to mix the two. This column is what the record keeps afterwards.
--
-- WHY `card_id` LOSES ITS NOT NULL, as in Batches 6 and 7: a deal started from a
-- canonical Goal and a canonical Copy has no legacy catalogue row to point at.
-- The old column and its foreign key stay, holding the demo's deals, and a NULL
-- satisfies a foreign key. validateWorld requires one reference and refuses both.
--
-- THERE IS NO UNIQUE INDEX HERE, and the absence is deliberate. A Goal may be
-- negotiated once at a time, which is a rule about ACTIVE deals and about the
-- Goal, not about the card — `oneNegotiationPerGoal` holds it, validateWorld
-- checks it, and a Collector who bought this card once and wants another is
-- describing two deals over one canonical card, which is correct. Uniqueness on
-- (collector, canonical card) would forbid the second one.
--
-- NOTHING IS BACKFILLED. No `card_id` is translated into a canonical id: doing
-- so would be guessing which printing a demo row meant, and a guess recorded as
-- identity is indistinguishable from a fact. Production holds no opportunities.
--
-- WHAT THIS DOES NOT TOUCH. Binder copies, trade rows and conversations still
-- carry a legacy `card_id`, and `opportunity_trade_refs.card_id` — the cards a
-- Collector offers BACK — is the trade batch's, not this one's. Each moves with
-- the batch that rewrites the command that writes it.
--
-- AND WHAT IS NOT HERE AT ALL: discovery. An Opportunity Discovery — this
-- Collector's Goal and this Trusted Partner's available Copy naming one exact
-- canonical card inside an accepted relationship — is computed from the Goals,
-- the Copies and the Relationships every time it is asked for, and is stored
-- nowhere. It cannot go stale, it cannot be duplicated, and reconciling it
-- cannot erase anything, because there is nothing to reconcile. A table would
-- have had to answer what happens when a Copy is archived and re-listed, and
-- the honest answer is "the same question gets the same answer", which is what
-- a derivation already is.
-- ============================================================================

alter table metyet.opportunities
  add column canonical_card_id text;

alter table metyet.opportunities
  add constraint opportunities_canonical_card_fk
  foreign key (canonical_card_id)
  references metyet_catalog.canonical_cards (canonical_card_id)
  deferrable initially deferred;

alter table metyet.opportunities
  alter column card_id drop not null;

-- "Which deals were about this card" — the question a Collector's own history
-- asks, and the one a catalogue correction would have to ask before it moved.
create index opportunities_canonical_card_idx
  on metyet.opportunities (canonical_card_id);
