-- ============================================================================
-- 0004 — COLLECTOR INVITATIONS: AN OFFER THAT NAMES NOBODY (Phase 5 Batch 2)
--
-- A Trusted Partner's invitation to their Collector Network is now created
-- BEFORE anyone has joined, and it does not bring a Collector into being.
--
-- WHY THE OLD SHAPE HAD TO GO. `inviteCollector` used to mint a Collector
-- record and bind the invitation to it. That cannot satisfy a decision the
-- product has already made — a Collector may belong to any number of Collector
-- Networks (METYET-DOMAIN-CONTRACT.md §2). Two Trusted Partners inviting the
-- same person produced two Collector identities, and metyet_auth.accounts
-- permits one active account per subject AND one per collector, so that person
-- could only ever have been one of them. The second invitation was unredeemable
-- by the person it was meant for.
--
-- So an invitation names nobody. The Collector actor is resolved — or created
-- for the first time — when the invited human authenticates and redeems, which
-- is Phase 5 Batch 3's work and is deliberately absent here.
--
-- TWO CHANGES, AND THE SECOND IS THE IMPORTANT ONE.
-- ============================================================================

-- 1 --------------------------------------------------------------------------
-- The canonical invitation may exist without a Collector. `collector_id` stays
-- a foreign key, so once Batch 3 resolves one it must be a Collector that
-- exists; until then it is NULL, and the row is still a complete product fact:
-- who invited, when, until when, and whether it was withdrawn.
alter table metyet.invitations alter column collector_id drop not null;

-- 2 --------------------------------------------------------------------------
-- THE CREDENTIAL, AND IT IS NOT IN THE CANONICAL WORLD.
--
-- Migrations 0002 and 0003 both state the rule this follows: the world
-- repository loads and saves canonical product state only, and must never carry
-- a credential. So the secret that redeems an invitation lives here, in
-- metyet_auth, beside accounts and partner invitations — and the world can be
-- loaded, projected and shipped to a browser without it existing on that path
-- at all.
--
-- WHAT IS STORED IS A DIGEST, NEVER THE CREDENTIAL. SHA-256, exactly as
-- partner_invitations does it, and for the same reason: the plaintext is shown
-- to the Trusted Partner once, at creation, and after that neither this table
-- nor any log nor a stolen backup can reproduce it. An invitation whose
-- credential was lost is revoked and re-issued, never recovered.
--
-- SINGLE USE IS STRUCTURAL. `claimed_at` is written by an UPDATE whose WHERE
-- clause requires it to be null, so two concurrent redemptions of one
-- credential cannot both succeed — the second updates no row. Phase 5 Batch 2
-- provides that primitive and deliberately gives it no caller: nothing in the
-- product can redeem an invitation yet.
--
-- CLAIMING IS NECESSARY, NOT SUFFICIENT. Expiry, revocation and acceptance are
-- PRODUCT facts and live on the canonical invitation, not here. Batch 3 must
-- check both sides in one transaction: this table says the secret is genuine
-- and unspent; the canonical row says the offer is still open.
--
-- There is no foreign key into `metyet`, for the same reason 0002 and 0003 have
-- none: credential storage must not depend on the world being loaded, and a row
-- pointing at an invitation the world does not have is a support question
-- rather than a constraint violation.
-- ----------------------------------------------------------------------------
create schema if not exists metyet_auth;

create table metyet_auth.collector_invitation_credentials (
  invitation_id text        primary key,
  token_digest  text        not null unique,
  created_at    timestamptz not null default now(),
  claimed_at    timestamptz,
  claimed_by    text,
  -- What a redemption produced is recorded together or not at all, and only for
  -- a credential that was actually claimed.
  constraint collector_credentials_claim_check check (
    (claimed_at is null and claimed_by is null) or claimed_at is not null
  )
);

-- Support lookup: "what became of the credential for this invitation?". The
-- redemption path finds a credential by its digest alone, which the unique
-- constraint above already indexes.
create index collector_credentials_claimed_idx
  on metyet_auth.collector_invitation_credentials (claimed_at)
  where claimed_at is null;
