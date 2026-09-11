-- ============================================================================
-- 0001 — THE CANONICAL WORLD, NORMALIZED (Phase 3 Batch 2)
--
-- One table per canonical collection, one row per domain record, keyed by the
-- domain's own ids. The rule for what is a column:
--
--   COLUMNS   identity (the domain id), collection order (`ord`), and every
--             reference from one record to another, with foreign keys.
--   attrs     JSONB: the record's remaining fields exactly as the domain holds
--             them — descriptive fields, money, dates, photos, notes and, for an
--             Opportunity, the whole negotiation aggregate (price thread, trade
--             package, deal, fulfillment, reading positions).
--
-- Why attributes are JSONB rather than typed columns: the domain is the
-- authority for them. Commands accept amounts as numbers or numeric strings and
-- store what they were given, dates are domain strings (demo dates and ISO
-- times), and an Opportunity is mutated as one aggregate. A typed column would
-- coerce or reshape those values and put a second copy of the domain's
-- vocabulary in SQL. A few attributes useful to query are exposed as STORED
-- GENERATED columns: derived from attrs, never written, never read back.
--
-- Constraints are structural only, and never stricter than validateWorld():
-- primary keys, reference existence and exact-copy ownership (composite foreign
-- keys), one current Relationship per pair, unique thread keys. No workflow
-- rule lives here. Deliberately NOT constrained:
--   - opportunities.goal_id has no foreign key: a completed or ended deal may
--     keep the id of a Goal its collector has since removed;
--   - a BinderCopy may be referenced by several deals (the established demo
--     world does this; validateWorld allows it);
--   - interests, preferences and relationships carry no domain id, so `ord`
--     is their key.
--
-- Every foreign key and uniqueness constraint is DEFERRABLE INITIALLY DEFERRED:
-- a world is saved as one transaction and checked as one state at COMMIT, so
-- write order inside the transaction never matters.
--
-- The schema is `metyet`, not `public`: this data is read and written only by
-- the MetYet service through the domain boundary, never exposed directly.
-- ============================================================================

create schema if not exists metyet;

-- The world's version: incremented by every transaction that changes it.
create table metyet.world_meta (
  singleton boolean primary key default true check (singleton),
  version   bigint  not null default 0
);
insert into metyet.world_meta (singleton, version) values (true, 0);

-- --------------------------------------------------------------- PARTIES & CARDS
create table metyet.catalog_cards (
  id    text    primary key,
  ord   integer not null,
  attrs jsonb   not null,
  name  text    generated always as (attrs ->> 'name') stored,
  constraint catalog_cards_ord_key unique (ord) deferrable initially deferred
);

create table metyet.collectors (
  id    text    primary key,
  ord   integer not null,
  attrs jsonb   not null,
  constraint collectors_ord_key unique (ord) deferrable initially deferred
);

create table metyet.partners (
  id    text    primary key,
  ord   integer not null,
  attrs jsonb   not null,
  constraint partners_ord_key unique (ord) deferrable initially deferred
);

-- --------------------------------------------------------------- THE NETWORK
create table metyet.relationships (
  ord          integer primary key,
  partner_id   text    not null,
  collector_id text    not null,
  attrs        jsonb   not null,
  status       text    generated always as (attrs ->> 'status') stored,
  constraint relationships_partner_fk foreign key (partner_id)
    references metyet.partners (id) deferrable initially deferred,
  constraint relationships_collector_fk foreign key (collector_id)
    references metyet.collectors (id) deferrable initially deferred,
  -- One CURRENT relationship per pair (status absent, null or "accepted").
  constraint relationships_one_current_per_pair
    exclude using btree (partner_id with =, collector_id with =)
    where (status is null or status = 'accepted')
    deferrable initially deferred
);

create table metyet.invitations (
  id           text    primary key,
  ord          integer not null,
  partner_id   text    not null,
  collector_id text    not null,
  attrs        jsonb   not null,
  constraint invitations_ord_key unique (ord) deferrable initially deferred,
  constraint invitations_partner_fk foreign key (partner_id)
    references metyet.partners (id) deferrable initially deferred,
  constraint invitations_collector_fk foreign key (collector_id)
    references metyet.collectors (id) deferrable initially deferred
);

-- --------------------------------------------------------------- GOALS & COPIES
create table metyet.goals (
  id           text    primary key,
  ord          integer not null,
  collector_id text    not null,
  card_id      text    not null,
  attrs        jsonb   not null,
  tier         text    generated always as (attrs ->> 'tier') stored,
  constraint goals_ord_key unique (ord) deferrable initially deferred,
  constraint goals_collector_fk foreign key (collector_id)
    references metyet.collectors (id) deferrable initially deferred,
  constraint goals_card_fk foreign key (card_id)
    references metyet.catalog_cards (id) deferrable initially deferred
);

create table metyet.preferences (
  ord          integer primary key,
  collector_id text    not null,
  attrs        jsonb   not null,
  constraint preferences_collector_fk foreign key (collector_id)
    references metyet.collectors (id) deferrable initially deferred
);

create table metyet.inventory_copies (
  inv_id     text    primary key,
  ord        integer not null,
  partner_id text    not null,
  card_id    text    not null,
  attrs      jsonb   not null,
  archived   boolean generated always as (coalesce(attrs -> 'archived' = 'true'::jsonb, false)) stored,
  constraint inventory_copies_ord_key unique (ord) deferrable initially deferred,
  -- The pair is what exact-copy references point at: a copy AND its owner.
  constraint inventory_copies_owner_key unique (inv_id, partner_id),
  constraint inventory_copies_partner_fk foreign key (partner_id)
    references metyet.partners (id) deferrable initially deferred,
  constraint inventory_copies_card_fk foreign key (card_id)
    references metyet.catalog_cards (id) deferrable initially deferred
);

create table metyet.binder_copies (
  id           text    primary key,
  ord          integer not null,
  collector_id text    not null,
  card_id      text    not null,
  attrs        jsonb   not null,
  constraint binder_copies_ord_key unique (ord) deferrable initially deferred,
  constraint binder_copies_owner_key unique (id, collector_id),
  constraint binder_copies_collector_fk foreign key (collector_id)
    references metyet.collectors (id) deferrable initially deferred,
  constraint binder_copies_card_fk foreign key (card_id)
    references metyet.catalog_cards (id) deferrable initially deferred
);

create table metyet.interests (
  ord        integer primary key,
  partner_id text    not null,
  binder_id  text    not null,
  attrs      jsonb   not null,
  constraint interests_partner_fk foreign key (partner_id)
    references metyet.partners (id) deferrable initially deferred,
  constraint interests_binder_fk foreign key (binder_id)
    references metyet.binder_copies (id) deferrable initially deferred
);

-- --------------------------------------------------------------- OPPORTUNITIES
-- attrs holds the negotiation aggregate. goal_id and inv_id are also kept in
-- attrs exactly as the domain holds them (null, absent or an id); the columns
-- are their relational mirror (an id or NULL), checked on every load.
create table metyet.opportunities (
  id           text    primary key,
  ord          integer not null,
  collector_id text    not null,
  partner_id   text    not null,
  card_id      text    not null,
  goal_id      text,
  inv_id       text,
  attrs        jsonb   not null,
  stage        text    generated always as (attrs ->> 'stage') stored,
  constraint opportunities_ord_key unique (ord) deferrable initially deferred,
  constraint opportunities_collector_key unique (id, collector_id),
  constraint opportunities_participants_key unique (id, collector_id, partner_id),
  constraint opportunities_collector_fk foreign key (collector_id)
    references metyet.collectors (id) deferrable initially deferred,
  constraint opportunities_partner_fk foreign key (partner_id)
    references metyet.partners (id) deferrable initially deferred,
  constraint opportunities_card_fk foreign key (card_id)
    references metyet.catalog_cards (id) deferrable initially deferred,
  -- The exact InventoryCopy, owned by this deal's partner.
  constraint opportunities_copy_fk foreign key (inv_id, partner_id)
    references metyet.inventory_copies (inv_id, partner_id) deferrable initially deferred
);
create index opportunities_goal_idx on metyet.opportunities (goal_id);
create index opportunities_inv_idx on metyet.opportunities (inv_id);

-- The exact BinderCopy references inside each trade package, as rows. Written
-- from the Opportunity aggregate on every save and compared with it on every
-- load; never used to rebuild it. No uniqueness on binder_id: one copy may
-- appear in several deals' history.
create table metyet.opportunity_trade_refs (
  opportunity_id text    not null,
  row_ord        integer not null,
  trade_card_id  text    not null,
  collector_id   text    not null,
  card_id        text    not null,
  binder_id      text,
  primary key (opportunity_id, row_ord),
  constraint opportunity_trade_refs_row_key unique (opportunity_id, trade_card_id) deferrable initially deferred,
  constraint opportunity_trade_refs_opportunity_fk foreign key (opportunity_id, collector_id)
    references metyet.opportunities (id, collector_id) deferrable initially deferred,
  constraint opportunity_trade_refs_card_fk foreign key (card_id)
    references metyet.catalog_cards (id) deferrable initially deferred,
  -- The exact BinderCopy, owned by the deal's collector.
  constraint opportunity_trade_refs_copy_fk foreign key (binder_id, collector_id)
    references metyet.binder_copies (id, collector_id) deferrable initially deferred
);
create index opportunity_trade_refs_binder_idx on metyet.opportunity_trade_refs (binder_id);

-- --------------------------------------------------------------- CONVERSATIONS
create table metyet.conversations (
  id             text    primary key,
  ord            integer not null,
  key            text    not null,
  collector_id   text    not null,
  partner_id     text    not null,
  card_id        text    not null,
  opportunity_id text,
  attrs          jsonb   not null,
  constraint conversations_ord_key unique (ord) deferrable initially deferred,
  constraint conversations_key_key unique (key) deferrable initially deferred,
  constraint conversations_collector_fk foreign key (collector_id)
    references metyet.collectors (id) deferrable initially deferred,
  constraint conversations_partner_fk foreign key (partner_id)
    references metyet.partners (id) deferrable initially deferred,
  constraint conversations_card_fk foreign key (card_id)
    references metyet.catalog_cards (id) deferrable initially deferred,
  -- A thread linked to a deal is between that deal's participants.
  constraint conversations_opportunity_fk foreign key (opportunity_id, collector_id, partner_id)
    references metyet.opportunities (id, collector_id, partner_id) deferrable initially deferred
);

create table metyet.conversation_entries (
  conversation_id text    not null,
  ord             integer not null,
  id              text    not null,
  attrs           jsonb   not null,
  at              text    generated always as (attrs ->> 'at') stored,
  primary key (conversation_id, ord),
  constraint conversation_entries_id_key unique (conversation_id, id) deferrable initially deferred,
  constraint conversation_entries_conversation_fk foreign key (conversation_id)
    references metyet.conversations (id) deferrable initially deferred
);

-- --------------------------------------------------------------- ACTIVITY & REVIEW
-- partner_id mirrors attrs.partnerId: legacy rows may have no owner (D-4).
create table metyet.activity (
  id           text    primary key,
  ord          integer not null,
  collector_id text    not null,
  partner_id   text,
  attrs        jsonb   not null,
  constraint activity_ord_key unique (ord) deferrable initially deferred,
  constraint activity_collector_fk foreign key (collector_id)
    references metyet.collectors (id) deferrable initially deferred,
  constraint activity_partner_fk foreign key (partner_id)
    references metyet.partners (id) deferrable initially deferred
);

create table metyet.photo_requests (
  id           text    primary key,
  ord          integer not null,
  collector_id text    not null,
  partner_id   text    not null,
  inv_id       text    not null,
  attrs        jsonb   not null,
  constraint photo_requests_ord_key unique (ord) deferrable initially deferred,
  constraint photo_requests_collector_fk foreign key (collector_id)
    references metyet.collectors (id) deferrable initially deferred,
  constraint photo_requests_copy_fk foreign key (inv_id, partner_id)
    references metyet.inventory_copies (inv_id, partner_id) deferrable initially deferred
);

create table metyet.copy_reviews (
  id           text    primary key,
  ord          integer not null,
  collector_id text    not null,
  partner_id   text    not null,
  inv_id       text    not null,
  attrs        jsonb   not null,
  constraint copy_reviews_ord_key unique (ord) deferrable initially deferred,
  constraint copy_reviews_collector_fk foreign key (collector_id)
    references metyet.collectors (id) deferrable initially deferred,
  constraint copy_reviews_copy_fk foreign key (inv_id, partner_id)
    references metyet.inventory_copies (inv_id, partner_id) deferrable initially deferred
);
