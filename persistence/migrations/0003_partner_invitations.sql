-- ============================================================================
-- 0003 — TRUSTED PARTNER INVITATIONS (Phase 3 Batch 5)
--
-- MetYet is invite-only. There is no public path by which anyone can become a
-- Trusted Partner: MetYet decides who is invited, and an invitation is what
-- authorizes that one person, once, to bring their Trusted Partner into being.
--
-- AN INVITATION IS NOT A LOGIN. It authorizes REGISTRATION and nothing else.
-- The moment it is redeemed it is spent, and from then on the person's ongoing
-- authority is the same as everyone else's: a verified provider subject mapped
-- to one actor in metyet_auth.accounts. That is why this table has no bearing
-- on any later request.
--
--   id            what the founder quotes in support ("inv-…").
--   email         who the invitation was addressed to, normalized to lower
--                 case. The redeemer's VERIFIED email must equal it.
--   store_name    the Trusted Partner's name as MetYet approved it. This is
--                 what the canonical partner record is created with; the person
--                 does not name their own store at redemption.
--   contact_name  optional, for the founder's own email — never canonical data.
--   token_hash    SHA-256 of the credential. THE CREDENTIAL ITSELF IS NEVER
--                 STORED. It is shown to the founder once, at creation, and
--                 after that neither this table nor any log can reproduce it:
--                 a stolen database backup cannot be redeemed.
--   created_at / expires_at / accepted_at / revoked_at
--                 the whole lifecycle, as four timestamps that are only ever
--                 written once. Status is derived from them (see `status`),
--                 never stored as a word that could disagree with them.
--   partner_id / account_id / redeemed_subject
--                 what the redemption produced, for support and audit. Set in
--                 the same transaction as accepted_at, or not at all.
--
-- SINGLE USE IS STRUCTURAL, not a check in application code: redemption is an
-- UPDATE whose WHERE clause requires accepted_at, revoked_at to be null and
-- expires_at to be in the future, inside the transaction that also creates the
-- partner and the account. Two concurrent redemptions of one token therefore
-- serialize, and the second updates no row.
--
-- REISSUE, NEVER REACTIVATE. A pending invitation is revoked and a new one is
-- created; no timestamp is ever cleared and no credential is ever re-used, so
-- what happened to an invitation stays readable afterwards.
--
-- Invitations live in `metyet_auth`, beside accounts, and not in `metyet`: the
-- world repository loads and saves canonical state only and must never carry a
-- credential. There is no foreign key into `metyet` for the same reason the
-- accounts table has none (see 0002).
-- ============================================================================

create schema if not exists metyet_auth;

create table metyet_auth.partner_invitations (
  id               text        primary key,
  email            text        not null,
  store_name       text        not null,
  contact_name     text,
  token_hash       text        not null unique,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  accepted_at      timestamptz,
  revoked_at       timestamptz,
  partner_id       text,
  account_id       text,
  redeemed_subject text,
  note             text,
  constraint partner_invitations_email_check      check (email = lower(email) and position('@' in email) > 1),
  constraint partner_invitations_store_name_check check (length(btrim(store_name)) > 0),
  constraint partner_invitations_expiry_check     check (expires_at > created_at),
  -- An invitation is accepted or revoked, never both.
  constraint partner_invitations_outcome_check    check (accepted_at is null or revoked_at is null),
  -- What redemption produced is recorded all together or not at all, and only
  -- for an invitation that was actually accepted. It is written by the second
  -- statement of the redemption (the claim is the first), so the in-between
  -- state — accepted, nothing recorded yet — is allowed on purpose; both
  -- statements are in one transaction, so it is never a state anyone can read.
  constraint partner_invitations_redemption_check check (
    (partner_id is null and account_id is null and redeemed_subject is null)
    or (accepted_at is not null and partner_id is not null and account_id is not null and redeemed_subject is not null)
  )
);

-- Support lookups: "what is outstanding for this address?" and "what did this
-- person's registration produce?". Neither is on the redemption path, which
-- finds an invitation by its token hash alone (the unique constraint above).
create index partner_invitations_email_idx on metyet_auth.partner_invitations (email);
create unique index partner_invitations_partner_key on metyet_auth.partner_invitations (partner_id)
  where partner_id is not null;
