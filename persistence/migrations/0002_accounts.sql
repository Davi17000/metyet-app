-- ============================================================================
-- 0002 — ACCOUNTS: WHO IS ALLOWED TO ACT, AND AS WHOM (Phase 3 Batch 3)
--
-- The canonical world knows Collectors and Trusted Partners. It does not know
-- sign-ins. This table is the only bridge: one row maps an authentication
-- provider's stable subject to exactly one MetYet actor.
--
--   subject      the identity provider's `sub` claim, from a VERIFIED token.
--                Never an email or a name: an address can change hands and is
--                not authority.
--   role         which seat this account acts as — "collector" or "tp".
--   collector_id / partner_id   the actor. Exactly one, matching the role.
--   status       "active" or "disabled". Rows are disabled, never deleted, so
--                an account's history survives.
--
-- Structural protection against an ambiguous mapping, which is what would make
-- authority uncertain:
--   - one ACTIVE account per subject;
--   - one ACTIVE account per Collector and per Trusted Partner;
--   - exactly one actor id per row, and it agrees with the role.
-- Disabled rows are exempt, so an actor can be re-provisioned later.
--
-- Accounts live in their own schema (`metyet_auth`), not in `metyet`: the world
-- repository loads and saves canonical state only, and must never carry sign-in
-- data. There is no foreign key into `metyet`, so provisioning does not depend
-- on the world being loaded; a row that points at an actor the world does not
-- have is rejected at request time, by name, rather than silently projecting
-- nothing.
--
-- Accounts are created by the founder/admin path only (see server/auth/
-- accounts.js). There is no self-service Trusted Partner signup.
-- ============================================================================

create schema if not exists metyet_auth;

create table metyet_auth.accounts (
  id           text        primary key,
  subject      text        not null,
  role         text        not null,
  collector_id text,
  partner_id   text,
  status       text        not null default 'active',
  created_at   timestamptz not null default now(),
  disabled_at  timestamptz,
  constraint accounts_role_check check (role in ('collector', 'tp')),
  constraint accounts_status_check check (status in ('active', 'disabled')),
  -- Exactly one actor, and it is the one the role names.
  constraint accounts_one_actor_check check (
    (role = 'collector' and collector_id is not null and partner_id is null)
    or (role = 'tp' and partner_id is not null and collector_id is null)
  ),
  constraint accounts_disabled_check check ((status = 'disabled') = (disabled_at is not null))
);

create unique index accounts_active_subject_key on metyet_auth.accounts (subject) where status = 'active';
create unique index accounts_active_collector_key on metyet_auth.accounts (collector_id) where status = 'active' and collector_id is not null;
create unique index accounts_active_partner_key on metyet_auth.accounts (partner_id) where status = 'active' and partner_id is not null;
