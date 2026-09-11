# MetYet — Phase 3 Architecture & Migration Recommendation

**Audited code:** `main` @ `bf702695dc9d0b19bc3ee84f9272a7ee2c7dcfb2` (merge of PR #30).
Local `main` and `origin/main` refs both resolve to this SHA. A live remote check was not possible: the network proxy refused `git fetch` from the Cowork VM, and the GitHub commits API fetch needed an approval that timed out.

**Governing records:** #31 (tracker), #32 (decision log), #33 (Phase 2 closeout), #34 (Phase 3 scope), `METYET-DOMAIN-CONTRACT.md`, and the Phase 2 closeout audit.

**Type:** architecture and planning only. No source, branch, commit, push, dependency or provisioning changes.

---

## 1. Executive recommendation

**Recommended stack:**

- **One Node.js service on Render.** It serves both the static React client and a two-endpoint API.
  - That API runs the existing `execute()` and `projectForActor()` **unchanged**, inside a single Postgres transaction per command.
- **Supabase** provides the managed Postgres database (normalized schema), Auth (passwordless email) and, later, Storage for card photos.
- **Resend** delivers auth and invitation email.
- **Sentry** (free tier) records errors.

**Why this shape:**

- **The domain layer is already the product.** The 41 commands and the projection are pure, dependency-free CommonJS, and 2,807 tests prove them. The architecture must run that code as-is in Node on the server, with nothing re-implemented in SQL policies, cloud functions or handlers.
- **Few moving parts.** There is one long-running Node process and one managed Postgres with auth and storage attached. There are no serverless connection-pool puzzles, no second runtime, and no self-hosted database or auth.
- **Pilot correctness over scale.** Every command takes one global transaction lock, which serializes writes. That is trivially correct, and a pilot's traffic is far below the point where it matters. The upgrade path (network-scoped locks and loaders) needs no rewrite.

**Accounts:** 3 new vendor accounts are required (Supabase, Render, Resend); Sentry is an optional fourth. Matt already has GitHub and the domain registrar/DNS.

**Estimated pilot cost:**

- About **$32–45/month** for production plus a free staging tier.
- About **$80–130/month** if email, error or compute tiers need upgrading during a busy pilot (details in §15).

**First implementation batch:** *Batch 1 — Domain server-readiness* (§19).

- A server-owned clock and ID source for commands.
- The locked `viewedAt` privacy rule, which `main` currently violates.
- A canonical world-shape validator.

It needs no vendors, no new dependencies and no UI change.

---

## 2. Current architecture findings

Findings come from inspecting `main`.

| Area | Finding | Consequence for Phase 3 |
|---|---|---|
| **Canonical state** | 15 collections: `catalog, collectors, partners, relationships, invitations, goals, preferences, inventory, binder, interests, opportunities, conversations, activity, photoRequests, copyReviews`. The product seed is ~112 KB of JSON (84 cards, 13 collectors, 4 partners, 41 inventory, 76 goals, 38 opportunities, 34 binder, 34 interests, 24 activity, 22 relationships). An Opportunity is a deep aggregate: `priceThread`, `trade.cards[]` each with `valueThread`/`percentThread`, `deal.adjThread`, `fulfillment`, `viewedAt`. | Entities map cleanly to tables. The Opportunity negotiation sub-tree is best kept as one JSONB document owned by the domain (§6). |
| **`metyet-store.js`** | An in-memory closure: `get / sub / execute / actorFor / cardById`, plus test-only `fixture.*` and a legacy `actions` facade. `execute` is **synchronous**, replaces the whole state object and notifies subscribers. | This interface is the seam: production gets a *RemoteStore*, and the demo keeps the in-memory store. |
| **`execute(state, actor, command, payload)`** | Pure `(state, actor, payload) → {ok, state, value} \| {ok:false, refused}`. There are 41 commands and 29 refusal codes. `resolveActor` derives the seat from `{partnerId}` or `{collectorId}` and requires the record to exist; claimed seats are ignored. Refusal is atomic (it returns the unchanged state). | Runs server-side unchanged. The server supplies the actor from the session, never from the request. |
| **Clock and IDs** | Commands take `at` from the **payload**. Clients send frozen demo dates (TP `TODAY = 2026-08-09`, Collector `AT = "2026-08-14"`). IDs come from `Math.random()` (`rid()`, thread entries, trade rows, inventory ids). `appendThreadEntry` falls back to `new Date()`. | The server must own time and IDs (Batch 1). Client-supplied `at` must be ignored in production. |
| **`projectForActor(state, actor)`** | Pure and deterministic, returning a deep copy. It needs the **whole relevant world**: copy status derives from *all* opportunities, relationship checks read all relationships, and counterparties come from participant records. An unknown actor gets the empty projection. | Runs server-side unchanged, over a fully loaded world at pilot scale, with network-scoped loading later (§8). |
| **Privacy gap vs a locked rule** | `markDealViewed` writes both seats' reading positions onto the shared Opportunity (`viewedAt[seat]`), and the projection returns both to both participants. #34 and the prompt lock this: *the other participant's `viewedAt` is private*. | Must be fixed before server projections ship (Batch 1). |
| **TP root** (`src/MetYet.jsx`) | `world = useSyncExternalStore(store.sub, store.get)` → `canon = projectForActor(world, {partnerId})`, plus `readView()` for handlers. Writes are synchronous: 20 `run(`, 16 `act(`, 4 `store.execute` call sites read results or post-command state immediately. `partnerId` is a prop; the shell passes `p-self`. | Client migration must make writes async and use the server's returned view (Batch 5). |
| **Collector root** (`collector/MetYetCollector.jsx`) | Same pattern: projected `state` → `collectorView(state, collectorId)` → an `st` of selectors and 28 synchronous `exec(` writes. `collectorId` is a prop; the shell passes `c12`. | Same migration. `collectorView` stays client-side as a presentation adapter over the server projection. |
| **Seed coupling** | `buildCanonicalSeed`, `demoDealFixture` and all seed constants live inside `src/MetYet.jsx`, next to the TP app. Collector imports `buildCanonicalSeed` from it. Both persona roots fall back to a **seeded** store when none is injected. | Production cannot ship this. Seed and demo code move to a demo-only module and entry (Batch 5). |
| **Relationships and invitations** | `inviteCollector` creates a pending Collector plus an Invitation (with email and note). There is **no `acceptInvitation` command** and no relationship lifecycle commands, although the contract lists `acceptInvitation` (§7) and invitations "by link or QR code" (§2). | Phase 3 adds `acceptInvitation` to the domain (Batch 4), consistent with the contract. |
| **Photos** | Stored as string references (`"copy:inv-c2:front"`). There is no binary upload anywhere. | The storage path can wait (Phase 5), but the schema reserves object paths. |
| **Catalog** | 84 seeded identities; `resolveCardIdentity` registers new ones. `pokemon_cards.json` (13.6 MB) sits in the repo root and is **not referenced by code**. | The `card_identities` table is seeded from a curated import later (Phase 5 catalog entry). It is not shipped to clients wholesale. |
| **Build and deploy** | esbuild bundles and a custom test runner (92 suites). Dependencies are only `react`, `react-dom`, `esbuild` and `react-test-renderer` (Playwright is a dev dependency). GitHub Actions builds `site.build.mjs` (shell, DEV off / DEMO on) and deploys to **GitHub Pages** at `app.metyet.io`. `prod.build.mjs` is a TP-only smoke bundle. There is no server, env config or secrets. `tsconfig`/`vite.config.ts` are unused leftovers. | GitHub Pages terms forbid hosting commercial SaaS ("not … allowed to be used … providing commercial software as a service"). Production hosting must move. The demo can keep a static build. |
| **Keeps vs moves** | **Moves server-side unchanged:** `domain/metyet-domain.js`, `metyet-commands.js`, `metyet-projection.js`, `metyet-entities.js`. **Stays client-side:** `collector-view.js`, the React components, `shared/*`. **Replaced in production:** `metyet-store.js` (by RemoteStore). **Demo-only:** the shell, seed, persona switcher, Reset, DEMO loader and DEV simulators. | |

---

## 3. Recommended stack

| Concern | Recommendation | Notes |
|---|---|---|
| **Frontend hosting** | The same Render web service serves the built client bundle (`/`, `/assets/*`) | Same origin as the API, so no CORS and simple headers. |
| **Backend / API runtime** | **Node.js 20 LTS**, one **Fastify** service on **Render** (Starter instance, always on) | Node matches the tests and domain. Fastify gives JSON-schema validation, structured logging and rate limiting with little code. |
| **Database** | **Supabase Postgres** (Pro plan), normalized relational schema with JSONB for the Opportunity negotiation document | Accessed only by the server, over Supabase's IPv4 **session-mode pooler** (Render is IPv4-only). |
| **Auth** | **Supabase Auth**, passwordless email (6-digit code or magic link); the server verifies access tokens against Supabase's **JWKS** (asymmetric ES256 signing keys) | MetYet `accounts`/`account_roles` tables map an auth user to exactly one actor. |
| **Email** | **Resend** as Supabase Auth's custom SMTP | The default Supabase mailer only reaches team members and is capped at ~2/hour. |
| **Object / image storage** | **Supabase Storage** private bucket with server-issued signed upload URLs (Phase 5) | No new vendor. |
| **Deployment** | Render auto-deploys from GitHub `main` (production) and a `staging` branch (staging). Database migrations are SQL files in the repo, applied by an explicit npm script | Rollback: Render one-click previous deploy; migrations are forward-only and staging-first. |
| **Secrets / config** | Render environment variables (per service), Supabase dashboard settings; `.env.local` gitignored for local development | Nothing secret in the client bundle except the public Supabase URL and anon key (auth only). |
| **Observability** | Render logs and metrics, Supabase logs, **Sentry** for server and client errors, a `command_log` audit table | Privacy-safe logging rules in §13. |
| **Local development** | Node 20 plus **PGlite** (in-process Postgres via npm, no Docker) for tests and most development; a Supabase staging project for auth integration | Keeps Matt's macOS `npm run verify` gate working offline. |

**Vendor accounts:** Supabase, Render and Resend are new and required; Sentry is new and optional. GitHub and domain DNS are existing. That makes **3 required new accounts**.

---

## 4. Why it fits MetYet

1. **Runs the proven domain as-is.** `execute()` and `projectForActor()` are synchronous, pure CommonJS with no DOM or Node built-ins. In Node they `require()` directly, which is identical to how the 92 test suites run them. The rule "do not duplicate business rules in handlers" holds by construction.
2. **Relational integrity where it matters.** Relationships, copies, goals and deals are genuinely relational. Postgres gives foreign keys, partial unique indexes as backstops for commitment rules, real transactions and SQL for founder support queries.
3. **Correct concurrency with almost no design.** One transaction plus a global advisory lock serializes all commands. "One mutation → one canonical state change" becomes literally true at the database level.
4. **Server-side privacy is the only read path.** Clients never query tables. Supabase Row Level Security is switched on with *no* policies (deny-all to client roles), so a leaked anon key reads nothing.
5. **Founder-operable.** There are two dashboards (Render and Supabase), managed TLS, managed auth emails, daily backups, and one process to reason about. Fastify, Postgres and React are the most AI-agent-familiar stack available.
6. **Low lock-in.** The database is plain Postgres (`pg_dump` portable). The API is ordinary Node that could move to any container host. Supabase Auth is the stickiest piece; the server depends only on JWT verification through a small adapter, so another provider could replace it.
7. **Growth path without rewrite.** Scale up compute, then scope the world loader to an actor's network, then shard the lock per network. The API shape and domain stay put.

---

## 5. Alternatives

| Criterion | **A. Recommended: Render Node API + Supabase (DB/Auth/Storage) + Resend** | **B. Supabase all-in: Edge Functions API + static host** | **C. Firebase: Functions + Firestore + Auth + Hosting** | **D. Neon Postgres + separate auth (Clerk or Better Auth) + Vercel/Render** |
|---|---|---|---|---|
| **Runs existing JS domain unchanged** | Yes (Node, identical to tests) | Mostly. Deno runtime; domain must be bundled to ESM. Test runtime ≠ prod runtime | Yes (Node Cloud Functions) | Yes (Node) |
| **Relational integrity** | Full Postgres | Full Postgres | Weak (documents; no FKs or unique constraints across docs) | Full Postgres |
| **Transactions / concurrency** | Single transaction + advisory lock; long-lived pool | Per-invocation connection through the transaction pooler; 2 s CPU cap per request (world hydration and projection must fit) | Optimistic document transactions; hydrating a world means many billed reads; hard to serialize a whole command | Same as A. On Vercel, serverless pooling and cold starts |
| **Server command/projection** | Natural; can cache the world between requests | Stateless per request; no world cache | Stateless; expensive world loads | As A (Render) or B-like (Vercel) |
| **Auth and storage** | Supabase Auth + Storage, one vendor | Same | Firebase Auth + Storage, strong | Separate auth vendor (Clerk) or DIY library (Better Auth) = more security surface; storage is another vendor (S3/R2) |
| **Founder operability** | 2 dashboards + email | 1 dashboard + static host + email; Deno tooling and local Docker stack | 1 console, but Google Cloud IAM and billing complexity | 3–4 vendors |
| **AI-agent ergonomics** | Excellent (Node, Fastify, SQL) | Good | Good, but Firestore data modelling is error-prone for relational rules | Good |
| **Lock-in** | Low–moderate (auth) | Moderate | **High** (Firestore data model and rules) | Low–moderate |
| **Pilot cost** | ~$32/mo realistic | ~$25/mo + $0 static | Near $0 at pilot, but usage-metered with no default ceiling | Neon usage-based (a few $), Vercel Pro $20/seat (Hobby is non-commercial), Clerk free tier |
| **Growth** | Scale Render and Supabase compute; scope loaders | Edge CPU limits bite as the world grows | Read costs grow with world hydration | Good |
| **Verdict** | **Best overall fit** | Close second; the runtime split and CPU cap make it riskier for the unchanged-domain goal | Poor fit for relational deal integrity | More vendors and security surface for no pilot benefit |

Also considered and rejected:

- **E. Single VPS with self-managed Postgres** (cheapest). Patching, TLS, backups and uptime become Matt's job, which fails founder-operability.
- **F. Render-only with Render Postgres and a DIY auth library.** One fewer vendor, but Matt would own password/OTP, session and email-verification security code. That is not worth one account.

---

## 6. Persistence and data model

**Model: normalized relational, with one JSONB document per Opportunity for its negotiation state. Not a world blob, and not event sourcing.**

Why not a world blob: no integrity, whole-document write contention, no SQL support queries, and privacy mistakes become one `SELECT` away.

Why not event sourcing: the domain is already state-transition based, so event sourcing adds projection rebuild machinery with no pilot benefit. `command_log` gives an audit trail instead.

### Tables

Postgres; `text` ids preserve today's canonical ids.

| Table | Key columns | Maps from canonical |
|---|---|---|
| `accounts` | `id uuid pk`, `auth_user_id uuid unique → auth.users`, `email citext`, `created_at`, `disabled_at` | *(new)* |
| `account_roles` | `id`, `account_id → accounts`, `role ('tp'\|'collector')`, `partner_id → partners null`, `collector_id → collectors null`, `created_at`, `revoked_at`. CHECK exactly one target. **Partial unique index: one active role per account (pilot).** | *(new)* |
| `partners` | `id pk`, `name`, `city`, `about`, `specialties text[]`, `website`, `instagram`, `email`, `phone`, `trade_rate numeric(5,4)`, `note`, `since`, `created_at`, `updated_at` | `partners[]` |
| `collectors` | `id pk`, `name`, `short`, `city`, `prefs text[]`, `pending bool`, `created_at`, `updated_at` | `collectors[]` |
| `collector_preferences` | `collector_id pk → collectors`, `tags text[]` | `preferences[]` |
| `relationships` | `pk (partner_id, collector_id)`, `status`, `at timestamptz`, `note`, `last`, `binder_reviewed_at` | `relationships[]` (partner-private fields stay here per D-1) |
| `invitations` | `id pk`, `partner_id`, `collector_id`, `email`, `note`, `at`, `accepted_at`, **server-only:** `token_hash`, `expires_at`, `revoked_at`, `accepted_by_account` | `invitations[]` (server-only columns never hydrate into canonical state) |
| `card_identities` | `id pk`, `identity_key unique`, `name`, `set`, `num`, `year`, `grade`, `value`, `edition`, `print`, `condition`, `language`, `tags text[]`, `csv_id` | `catalog[]` |
| `inventory_copies` | `inv_id pk`, `partner_id`, `card_id`, `ask numeric(12,2)`, `cost numeric(12,2) null`, `acquired date`, `archived bool`, `added_at`, `cert`, `photo_front`, `photo_back`, `note` | `inventory[]` (**Acquisition Cost stays on the exact copy**) |
| `binder_copies` | `id pk`, `collector_id`, `card_id`, `market numeric null`, `cert`, `photo_front`, `photo_back`, `added_at`, `updated_at` | `binder[]` (**private reference value**) |
| `goals` | `id pk`, `collector_id`, `card_id`, `tier`, `note`, `since`, `created_at`, `confirmed_at`, `secondary_since` | `goals[]` |
| `interests` | `pk (partner_id, binder_copy_id)`, `at` | `interests[]` |
| `opportunities` | `id pk`, `collector_id`, `partner_id`, `card_id`, `inv_id null`, `goal_id null`, `stage`, `listed_price`, `agreed_price`, `trade_rate`, `completed_at`, `declined`, `ended_at`, `end_reason`, `updated`, **`version int`**, **`negotiation jsonb`** (`priceThread`, `trade`, `deal`, `fulfillment`), generated `is_active` | `opportunities[]` |
| `opportunity_trade_rows` | `pk (opportunity_id, row_id)`, `binder_copy_id`, `inclusion`, `withdrawn`. Rewritten from `negotiation.trade.cards` on each opportunity write | *(derived index for integrity and queries)* |
| `opportunity_reads` | `pk (opportunity_id, seat, surface)`, `at` | `opportunity.viewedAt[seat][surface]` (per seat, so the projection can only ever return the actor's own) |
| `conversations` | `id pk`, `key unique`, `collector_id`, `partner_id`, `card_id`, `opp_id null` | `conversations[]` |
| `conversation_entries` | `id pk`, `conversation_id`, `seq`, `at`, `kind`, `by`, `text` | `conversations[].entries[]` (append-only) |
| `activity` | `id pk`, `partner_id not null`, `collector_id`, `type`, `text`, `date` | `activity[]` (owner required, D-4) |
| `photo_requests` | `id pk`, `collector_id`, `partner_id`, `inv_id`, `at`, `fulfilled_at` | `photoRequests[]` |
| `copy_reviews` | `id pk`, `collector_id`, `partner_id`, `inv_id`, `at`, `ended_at` | `copyReviews[]` |
| `world_meta` | `id = 1`, `version bigint` | *(new; bumps on every committed command)* |
| `command_log` | `command_id uuid pk` (client idempotency key), `account_id`, `seat`, `actor_id`, `command`, `outcome` (`ok` or refusal code), `result_value jsonb` (ids only), `world_version`, `created_at` | *(new; audit and idempotency; no payload bodies)* |
| `media_objects` *(Phase 5)* | `id`, `owner_seat`, `owner_id`, `path`, `kind`, `bytes`, `created_at` | photo references |

### Integrity backstops

The command layer stays authoritative. The database adds cheap guards **only for rules the domain already enforces and tests**:

- Foreign keys everywhere, including `relationships`, `goals`, copies and `opportunities`.
- Partial unique index: one active opportunity per `goal_id` (the goal lock).
- Partial unique index: one active, price-agreed opportunity per `inv_id` (InventoryCopy commitment).
- Unique index on `opportunity_trade_rows(binder_copy_id)` for committed rows in active opportunities (BinderCopy commitment).
- CHECKs: non-negative money, valid enums, and `activity.partner_id NOT NULL`.

A backstop violation means a domain bug. It surfaces as a 500 with the transaction rolled back, and is never a silent overwrite.

### Transactional boundary

**Every command is one database transaction:** lock, load, execute, persist diff, bump version, log, commit.

- Deal commands touch `opportunities`, `opportunity_trade_rows`, possibly `conversations`/`conversation_entries`, `photo_requests`, and the inventory and binder copies they reference. All of these commit or roll back together.

---

## 7. Auth and actor mapping

| Concept | Design |
|---|---|
| **Auth identity** | A Supabase Auth user (email, passwordless). The access token is a short-lived JWT; the refresh token is handled by `supabase-js` in the client. |
| **MetYet account** | An `accounts` row keyed by `auth_user_id`, created on first authenticated request. |
| **Actor** | Resolved **only** server-side: session JWT → `accounts` → active `account_roles` row → `{partnerId}` or `{collectorId}` → the domain's existing `resolveActor` check. Actor ids, `seat`, `by` and `at` in a request body are ignored for authority (the domain already ignores claimed seats). |
| **TP / shop mapping** | `account_roles(role='tp', partner_id)`. One login = one shop for the pilot. Future staff would add more `tp` rows for the same `partner_id`. |
| **Collector mapping** | `account_roles(role='collector', collector_id)`. A Collector may be in many networks; that lives in `relationships`, not in roles. |
| **TP onboarding (pilot)** | A founder-run admin script (`npm run admin:provision-partner`) creates the `partners` row and sends a Supabase invite email to the shop owner. No self-serve TP signup (see §18). |
| **Pre-account invitations** | `inviteCollector` (existing) creates the pending Collector placeholder and Invitation. The server also creates a random **single-use token**, stores only its hash with an expiry (e.g. 14 days), and returns a link `…/invite/<token>` (shareable by email, text or QR, per contract §2). Optionally the server sends the email via Resend. |
| **Invite acceptance / signup** | The invitee opens the link and signs in or up with email code. `POST /api/commands {command:"acceptInvitation", payload:{token}}` then runs a **new domain command**, `acceptInvitation`, in the same transaction. **New account:** binds the account to the placeholder collector, clears `pending`, creates Relationship `accepted` at server time, stamps `accepted_at`. **Existing collector account:** creates or keeps the Relationship with the existing collector (contract: "creates the Relationship, or leaves an existing one in place"), marks the invitation accepted, and retires the placeholder. Tokens are single-use, expiring and revocable; a refusal names only the rule. |
| **Session / re-login** | `supabase-js` persists and refreshes the session. On reload the client calls `GET /api/session` and the server returns the same actor. Logout clears the session. The server is stateless per request apart from the world cache. |
| **Future dual role** | `account_roles` already allows several rows. Remove the one-active-role partial index and add an `X-MetYet-Role: <role_id>` request header, validated against the account's roles; the client offers a role switch. No domain change: the actor is still one seat per request. |
| **Hard rule** | No endpoint accepts an actor id. There is no impersonation path in production: the persona switcher, DEV simulators and `fixture.*` do not exist in the production bundle or server. |

---

## 8. Server command and projection architecture

```
HTTPS request (Bearer access token)
  └─ authenticate: verify JWT via Supabase JWKS → auth_user_id
  └─ resolve actor: accounts → active account_roles → {partnerId}|{collectorId}    (403 if none)
  └─ validate: command name ∈ allow-list; payload JSON-schema per command; strip at/by/seat
  └─ BEGIN
       SELECT pg_advisory_xact_lock(<global key>)          -- serialize commands (pilot)
       SELECT version FROM world_meta FOR UPDATE
       world = cache.version == version ? cache.world : repository.loadWorld(tx)
       idempotency: command_log hit? → return stored outcome
       optimistic check: payload.ifOpportunityVersion ≠ current → refuse "stale"
       result = execute(world, actor, command, payload, { now: serverNow, newId })  -- UNCHANGED domain
       if refused → ROLLBACK (log refusal outside tx) → 409 { refused, version, view }
       ops = repository.diff(world, result.state)           -- row upserts/deletes per collection
       apply ops; bump world_meta.version; bump touched opportunities.version; insert command_log
     COMMIT
  └─ cache.world = result.state; cache.version = version + 1     (only after commit)
  └─ view = projectForActor(result.state, actor)             -- UNCHANGED domain, committed state
  └─ 200 { ok, value, version, view }
```

**How much moves unchanged:**

- `execute`, all 41 commands, the domain and the projection move **unchanged**, plus two small Batch 1 changes:
  1. An optional execution context `{ now, newId }` that the server supplies and tests and the demo can omit.
  2. `projectForActor` returns only the actor's own `viewedAt`.
- New domain code is limited to `acceptInvitation` (Batch 4).
- **Handlers contain no business rules:** they authenticate, validate shape, transact and project.

**Repository abstraction first.** Batch 2 builds `loadWorld(tx)`, `diff(before, after)` and `applyOps(tx, ops)` as a pure mapping layer between tables and the canonical world shape, proven by round-trip tests before any server exists. That keeps the domain the source of truth and lets loaders narrow later without touching handlers.

**Pilot loading strategy and growth path:**

- **Pilot:** load the whole world once, keep an **in-process read cache** keyed by `world_meta.version` (one instance), and re-check the version on every request, so external writes such as migrations or admin scripts invalidate it. A pilot world of a few TPs and a few hundred collectors is a few MB, and projection is milliseconds.
- **Growth:** scope `loadWorld` to the actor's network (their relationships, those collectors' records, copies and opportunities touching them, their threads). Replace the global lock with a per-network lock, and run multiple instances since the version check already guards the cache. Domain code is unchanged throughout.

**Refusals are data, not errors.** A refused command returns HTTP 409 with the refusal code and a fresh view, so a stale client re-renders the truth.

---

## 9. API design

The API is small and stable, with no CRUD-per-table.

| Endpoint | Purpose | Response |
|---|---|---|
| `GET /healthz` | Process up | `200 ok` |
| `GET /readyz` | Database reachable, migrations current | `200` / `503` |
| `GET /api/session` | Who am I | `{ account: {id,email}, actor: {seat, id}, displayName }`; `401` unauthenticated; `403` no active role |
| `GET /api/view` | The actor's projection | `{ version, view }` with `ETag: "<version>:<actorId>"`; `If-None-Match` → `304` (cheap polling) |
| `POST /api/commands` | The only write | Request `{ commandId: uuid, command, payload, ifOpportunityVersion? }`. `200 {ok:true, value, version, view}` · `409 {ok:false, refused, version, view}` · `400 {error:"invalid", details}` · `401` · `403` · `429` · `500 {error:"internal", errorId}` |
| `POST /api/uploads` *(Phase 5)* | Signed upload URL for a copy photo the actor owns | `{ path, signedUrl, expiresAt }`; the object path is then submitted via `addCopyPhotos` / `updateBinderCopy`, and the server verifies ownership of the path |

Auth itself is provider-managed: `supabase-js` in the client for sign-in by email code or link, token refresh and sign-out. The API trusts only verified JWTs.

**Validation and error behavior:**

- Per-command JSON schema: types, lengths, numeric ranges (money ≥ 0, ≤ 2 decimals), and message text length.
- Unknown fields are dropped. `at`, `by`, `seat`, `partnerId`/`collectorId` *as authority* are ignored; counterpart references stay as domain inputs the command validates.
- Domain refusals → `409` with the domain code; they never reveal other parties' data (the domain already words refusals safely).
- Unexpected exceptions → rollback, `500` with an `errorId` correlating Sentry and logs. The response carries no stack trace and no payload echo.

**Live updates:**

- Poll `GET /api/view` every ~10 s while the tab is visible, plus refetch on focus. `304` makes this nearly free.
- After the actor's own command, the response already carries the new view.
- Later option: a Supabase Realtime broadcast carrying only "version changed" (no data), prompting a refetch.

---

## 10. Concurrency and transactions

| Topic | Decision |
|---|---|
| **Transactions** | One transaction per command, `READ COMMITTED` plus a **global `pg_advisory_xact_lock`**, so commands are fully serialized. Reads (`GET /api/view`) take no lock and project the cached committed world. |
| **Versioning** | `world_meta.version` (monotonic) identifies the committed world, drives cache validity and ETags, and is returned with every view. `opportunities.version` bumps on every change to that deal. |
| **Stale clients** | The domain evaluates commands against **current** state, so turn, stage and ownership refusals already stop stale moves. For *acceptance* commands, where the user agrees to a figure they saw (`acceptPrice`, `acceptMarketValue`, `acceptTradePercent`, `acceptDeal`, `confirmFulfillmentPlan`), the client sends `ifOpportunityVersion`. If the deal changed in between, the server refuses `stale` with the fresh view, so nobody accepts a figure they never saw. This enforces #32's "current economic state controls final agreement" without changing the domain. |
| **Simultaneous TP and Collector commands** | The lock orders them. The second runs against the first's committed state and either succeeds or gets a precise refusal (e.g. `not-your-turn`, `stale`). No merge or synchronization logic exists anywhere. |
| **Retries / idempotency** | The client generates `commandId` per user action and retries network failures with the same id. `command_log` returns the stored outcome instead of re-executing, so a double tap cannot double-send a message or double-propose. Records are kept 30 days, then pruned. |
| **When the post-command projection is made** | After `COMMIT` succeeds, from the committed next state. A projection of uncommitted state is never returned. |
| **Lock scaling trigger** | Revisit when p95 command latency exceeds ~300 ms or throughput passes ~20 commands/second. Then move to per-network locks and scoped loading (§8). Neither is expected in the pilot. |

---

## 11. Production and demo separation

| | **Production app** | **Founder demo** |
|---|---|---|
| **Entry** | New `app/` entry: auth screens → RemoteStore → the persona root chosen by `/api/session` | Existing `shell/MetYetPrototype.jsx` (persona switcher, Reset, DEMO scenarios) |
| **Data** | Server and Postgres only; the database starts empty; no seed code in server or bundle | In-memory store and seed, per browser tab |
| **Build flags** | `__METYET_DEV__=false`, `__METYET_DEMO__=false`; demo modules not imported at all | DEMO on (as today) |
| **Hosting** | Render web service at the production hostname | Separate static site (e.g. Render static, free) at a clearly labelled demo hostname, `noindex`, with a "Demo data — not your account" banner |
| **Guards** | A CI test scans the production bundle and fails on seed markers (`buildCanonicalSeed`, `Northline`, `Sarah Mendel`, `Reset demo`, `Switch persona`, `fixture`, `partnerSimActor`). The server has no seed import and no `fixture`/`actions` surface. | Existing DEV/DEMO gates and tests |

**Required refactor (Batch 5):**

- Move `buildCanonicalSeed`, `demoDealFixture`, `demoDealStage` and all `*_SEED` constants from `src/MetYet.jsx` into `demo/seed.js`.
- Remove the seeded default stores from both persona roots; roots require an injected store.
- Keep `__store`/`partnerDemo` in demo modules only.

**Staging data:** a synthetic seed may be loaded into **staging only** by an explicit admin script that refuses to run against the production database URL.

**Known defects placement (not fixed now):**

| Defect | Batch | Acceptance |
|---|---|---|
| Collector **View deal** crashes on completed deals with a missing Goal | **Batch 5**. Real users will have completed deals whose goal was later removed; the production client must not crash. | The Deal page renders history when `goalId` has no goal (falls back to the opportunity's `cardId`); regression test added |
| TP sidebar footer hard-coded to "Northline Cards" | **Batch 5** (actor identity arrives with sessions) | The footer shows the session partner's name from the projection; bundle scan confirms no hard-coded shop name |

---

## 12. Deployment, environments and secrets

| Environment | Client + API | Database / Auth | Email | Purpose |
|---|---|---|---|---|
| **Local** | `npm run dev:server` (Node) + client dev build | PGlite in-process (tests, most development); test JWT signer | none (logged) | Everyday development; the macOS `npm run verify` gate |
| **Staging** | Render web service (free instance acceptable; spins down after ~15 min) from `staging` branch | Supabase project `metyet-staging` (separate free organization; pauses after 1 week idle) | Resend (test domain or sandbox) | Two-device end-to-end rehearsals, migration dry-runs, restore drills |
| **Production** | Render Starter web service from `main` | Supabase project `metyet-prod` (Pro) | Resend with verified sending domain | Real pilot users |
| **Demo** | Static demo build | none | none | Founder demos |

**Deploy flow:**

1. PR → CI (`npm run verify` + server tests on PGlite).
2. Merge to `staging` → Render auto-deploy → run `npm run db:migrate` against staging → two-device smoke.
3. Promote to `main` → migrate production (explicit step) → Render auto-deploy.
4. Rollback: Render "rollback to previous deploy". Database migrations are additive-first (expand, then contract), so a previous app version still runs.

**Secrets (never committed, never pasted into chat or source):**

- **Render env:** `DATABASE_URL` (Supabase session-pooler string, least-privilege server role), `SUPABASE_URL`, `SUPABASE_JWKS_URL`, `SENTRY_DSN`, `APP_ORIGIN`, `INVITE_TOKEN_PEPPER`.
- **Supabase dashboard:** SMTP credentials (Resend API key), auth redirect URLs.
- **Client build (public by design):** `SUPABASE_URL`, `SUPABASE_ANON_KEY` (auth only; RLS deny-all).
- **Local:** `.env.local` (gitignored).
- **Service role key:** used only by admin scripts run locally, never deployed to the client.

---

## 13. Security, backup and observability

**Pilot security baseline:**

- **Authn/authz:** JWKS-verified JWTs on every API call; actor from `account_roles` only; domain authorization unchanged; one active role per account.
- **Database access:** server-only via a dedicated Postgres role with DML on MetYet tables (no DDL at runtime). RLS enabled on every public table with **no policies**; `anon`/`authenticated` roles revoked from MetYet tables. Migrations run with a separate owner role.
- **Transport and headers:** HTTPS (Render-managed TLS), HSTS, a strict Content-Security-Policy (self + Supabase auth endpoint), same-origin API (no CORS), secure cookies not required (Bearer tokens).
- **Validation:** per-command schemas, body size limit (e.g. 64 KB; uploads go directly to Storage), text length caps.
- **Rate limiting:** Supabase Auth limits for sign-in and OTP (tune in dashboard, keep CAPTCHA option); API per account ~120 commands/min and per IP ~300 requests/min (in-memory, single instance).
- **Invite tokens:** 256-bit random, stored hashed (HMAC with pepper), single-use, expiring, revocable.
- **Privacy-safe logging:**
  - Log command name, seat, hashed actor id, outcome/refusal code, latency, world version and `errorId`.
  - **Never log** payload bodies, message text, costs, market values, notes, emails or tokens.
  - Sentry `beforeSend` scrubs request bodies and headers.
- **Vendor accounts:** MFA on GitHub, Supabase, Render, Resend and Sentry.
- **Backups:**
  - **Primary:** Supabase Pro daily backups, 7-day retention.
  - **Secondary:** a monthly `pg_dump` logical export kept by Matt in private storage.
  - **Drill:** one restore rehearsal into staging before the pilot starts.
  - **PITR** ($100/month per 7 days of retention) is not needed for the pilot; reconsider when real deals are frequent.
- **Migration discipline:** numbered SQL files, reviewed in PR, applied to staging first, expand/contract for destructive changes, never edited after merge.
- **Observability:**
  - Render logs and CPU/memory metrics.
  - Supabase database, auth and API logs (7-day retention on Pro).
  - Sentry for server exceptions and client errors, with a release tag per deploy.
  - `command_log` as a support and audit trail.
  - Render's health check on `/readyz` restarts unhealthy instances.
- **Out of scope:** SOC 2/compliance programs, WAF, multi-region, PITR, dedicated IPv4.

---

## 14. Migration batches and acceptance criteria

Each batch is narrow, independently mergeable, and follows the existing discipline: Claude implements locally, ChatGPT reviews, Matt runs macOS `npm run verify`.

### Batch 1 — Domain server-readiness
No vendors, no new dependencies.

**Scope:**
- `execute()` accepts an optional context `{ now(), newId(prefix) }`. When present, commands use it for every timestamp and id and ignore payload `at`. When absent, current behavior holds, so the demo and tests are unchanged.
- `projectForActor` returns only the actor's own `viewedAt` (locked rule).
- Add `validateWorld(state)`, a documented canonical collection/field shape check.

**Acceptance:**
- All 92 suites stay green.
- New tests: server clock overrides any client `at`; ids come from the injected generator and are unique; the other seat's `viewedAt` is absent for both seats (active and terminal deals); `validateWorld` passes the product seed, the DEMO seed and the unrelated fixture, and fails on malformed worlds.
- No UI or behavior change in the demo.

**Rollback:** revert the PR; no data exists.

### Batch 2 — Persistence contract
Local only. Dev dependencies: `@electric-sql/pglite`, a Postgres client.

**Scope:**
- `server/db/migrations/0001_init.sql` (§6 schema, RLS enabled, backstop indexes).
- Repository `loadWorld`, `diff`, `applyOps`.

**Acceptance:**
- On PGlite: seed and fixture round-trip `worldToRows → rowsToWorld` deep-equal to canonical.
- For a scripted full deal lifecycle, `execute` → `diff` → `apply` → `loadWorld` equals the in-memory result after every command.
- Backstop indexes reject a double-committed copy inserted by raw SQL.
- Server-only columns (`token_hash`) never appear in the hydrated world.

**Rollback:** delete `server/`; the demo and client are untouched.

### Batch 3 — Server skeleton
Local only; Fastify.

**Scope:**
- `/healthz`, `/readyz`, `/api/session`, `/api/view`, `/api/commands`.
- Advisory-lock transaction, world cache, idempotency, `ifOpportunityVersion`, error model, rate limits, privacy-safe logger.
- Auth *adapter* with a local test signer.

**Acceptance:**
- HTTP contract tests.
- A request body cannot change the actor (a spoofed `partnerId`/`seat` is ignored).
- Concurrent TP and Collector commands serialize with correct refusals.
- A stale acceptance is refused with a fresh view; a retried `commandId` is not re-executed.
- The **Phase 2 privacy audience matrices and UI-wiring assertions are ported to API responses** and pass.
- No endpoint ever returns canonical state; logs contain no payload text.

**Rollback:** not deployed.

### Batch 4 — Auth, actor mapping and invitations
Supabase staging project provisioned by Matt at that point.

**Scope:**
- `accounts`/`account_roles`/invitation token migrations.
- JWKS verification adapter.
- `acceptInvitation` domain command + tests.
- `admin:provision-partner` script.
- Resend SMTP configured in Supabase staging.

**Acceptance:**
- Unauthenticated → 401; account without role → 403; token for another project → 401.
- TP and Collector re-login map to the same actors.
- The invite link is single-use, expires and can be revoked. A new collector claims the placeholder; an existing collector gains a Relationship without a duplicate collector.
- An accepted collector enters the TP's network (Phase 2 visibility rules hold); a pending invitee does not.
- The one-active-role constraint is enforced.

**Rollback:** staging only; revert the PR.

### Batch 5 — Client migration and production/demo split

**Scope:**
- RemoteStore (`view`, async `execute` returning `{ok, value, view}`, polling with ETag).
- Persona roots consume a store view (no local projection in production); TP (40) and Collector (28) write sites await results; loading and error states.
- Sign-in and invite-accept screens; `app/` production entry.
- Seed and demo extraction to `demo/`.
- Production bundle guard; **footer identity fix**; **View-deal-without-goal fix**.

**Acceptance:**
- Existing UI suites pass against the in-memory adapter (demo semantics unchanged).
- New tests with a fake RemoteStore cover handlers, refusals, stale refusal re-render and idempotent retry.
- A Playwright two-browser end-to-end run against the local server completes a full deal (TP and Collector on separate sessions).
- The bundle scan finds no seed or demo markers; Lighthouse sanity check.

**Rollback:** the demo entry is unaffected, and production is not deployed until Batch 6.

### Batch 6 — Staging and production go-live

**Scope:**
- Render services (staging and production) and the demo static site.
- Supabase production (Pro) and Resend domain.
- Sentry; migrations applied; DNS; backup restore drill.

**Acceptance:**
- Two real devices complete invite → accept → goal → offer → trade → deal → fulfillment → completed on staging, then production.
- The production database contains no seed data.
- The restore drill succeeds.
- Logs pass a privacy spot-check; secrets are found only in dashboards.
- The GitHub Pages SaaS deployment is retired or converted to the demo only.

**Rollback:** Render previous deploy, DNS back to the demo, database restore from backup (production holds no real data until invites go out).

### Batch 7 (Phase 5) — Photos

**Scope:** Supabase Storage private bucket, `/api/uploads` signed upload, ownership-checked paths, short-lived signed read URLs added **inside** projections only for photo fields the actor may see, EXIF/GPS stripping, size and type limits.

**Acceptance:** an unrelated actor cannot obtain a signed URL for another party's photo; photo privacy matrix tests.

---

## 15. Pilot costs and founder operations

Prices are from vendor docs and 2026 pricing guides (see Sources); verify on each vendor's pricing page before subscribing.

| Item | Free-tier assumption | Realistic pilot | Busy pilot / upgrades |
|---|---|---|---|
| Supabase production | Free: 500 MB DB, pauses after 1 week idle, **no backups**; not acceptable for real users | **Pro $25/mo** (includes $10 compute credit, covering a Micro instance; 8 GB disk, 100k MAU, 7-day daily backups, spend cap on) | Small compute +$5; PITR +$100 (not recommended yet) |
| Supabase staging | Separate free org: $0 (pauses when idle) | $0 | ~$10/mo if made always-on inside the Pro org |
| Render production web service | Free instance spins down after ~15 min (~1 min wake); not acceptable | **Starter $7/mo** (always on) | Standard $25/mo if memory is tight |
| Render staging and demo | Free web service + free static site | $0 | $0 |
| Resend | Free: 3,000 emails/mo, 100/day | $0 (pilot invites and logins) | Pro $20/mo (50k/mo, no daily cap) |
| Sentry | Developer: free, 1 user, 5k errors/mo | $0 | Team $26/mo |
| Domain | existing | existing | existing |
| **Total** | $0 (internal testing only) | **≈ $32–45/mo** | **≈ $80–130/mo** (without PITR) |

**Founder operations (weekly or less):**

- Glance at Sentry and Render for errors and restarts.
- Check the Supabase usage page.
- Review Resend bounces.
- Monthly `pg_dump` export.
- Approve migrations in PR.
- Provision TPs with one admin command.

Nothing requires SSH, servers, certificates or patching.

---

## 16. Future external account and setup checklist

**Do not provision yet.** Needed by Batch 4 (staging) and Batch 6 (production).

1. **Supabase:** organization with MFA → projects `metyet-staging` (free org) and `metyet-prod` (Pro, US East region to match Render) → enable asymmetric JWT signing keys (default for new projects) → Auth: email OTP/magic link, site URL and redirect URLs, OTP expiry ≤ 1 hour, rate limits, optional CAPTCHA → Storage bucket (Phase 5) → note the session-pooler connection string → create the least-privilege server role.
2. **Resend:** account with MFA → verify the sending domain (DNS records at the registrar) → create an SMTP/API key → enter it in Supabase Auth SMTP settings (never in source or chat).
3. **Render:** workspace with MFA → connect the GitHub repo → web services `metyet-staging` and `metyet-app` → static site `metyet-demo` → environment variables per §12 → custom domains → health check path `/readyz`.
4. **Sentry** (optional but recommended): projects `metyet-server` and `metyet-client` → DSNs into Render env and the client build.
5. **DNS at the registrar:** production hostname → Render; demo hostname → Render static site; Resend DKIM/SPF/DMARC records.
6. **GitHub:** branch `staging`; required checks; repository secrets only if CI runs migrations (prefer manual `db:migrate` for the pilot).
7. **Local:** `.env.local` template (no values) committed as `.env.example`.

---

## 17. Risks and tradeoffs

| Risk / tradeoff | Mitigation |
|---|---|
| **Whole-world load and global lock** do not scale indefinitely | Correct and simple for the pilot. Version-checked cache avoids repeated loads. Documented triggers and path to scoped loaders and per-network locks (§8, §10). |
| **Async client migration** touches ~68 write call sites across two large components | Dedicated batch; the in-memory adapter keeps existing UI tests meaningful; two-browser end-to-end run before go-live. |
| **Supabase Auth dependency** | The server depends only on JWKS verification behind an adapter. The `accounts` table is MetYet-owned. |
| **Render ↔ Supabase network** (IPv4 pooler, cross-provider latency) | Same region (US East). The session-mode pooler supports transactions and transaction-scoped advisory locks. The ~$4/mo dedicated IPv4 add-on is available if the pooler misbehaves. |
| **JSONB negotiation document** hides deal internals from SQL constraints | Derived `opportunity_trade_rows` plus partial unique indexes back the commitment rules; the domain remains authoritative. |
| **Single instance** means a restart causes brief unavailability | Always-on Starter plan with health-check restarts. Pilot tolerance is acceptable; add a second instance only after per-network locks. |
| **Polling instead of realtime** | 10 s polling with `304`s is cheap and robust; Realtime "nudge" is an additive later step. |
| **Invite links are bearer tokens** (contract allows link or QR) | Single-use, expiring, revocable, hashed; TPs see acceptance status; a mistaken acceptance is recoverable by the TP. |
| **Hosting move off GitHub Pages** | Required by GitHub Pages terms for SaaS. The demo can keep a static build elsewhere. |
| **Free staging pauses** | Acceptable; unpause before rehearsals, or pay ~$10/mo for always-on. |

---

## 18. Genuine founder decisions required

Only choices that change product behavior, customer experience or operating cost are listed; everything else above is a technical recommendation.

1. **TP onboarding model for the pilot.**
   - *Recommended:* founder-provisioned, invite-only TP accounts (curated network, one admin command per shop).
   - *Alternative:* self-serve TP signup, which needs verification, abuse controls and billing thinking.
2. **Sign-in method.**
   - *Recommended:* passwordless email (6-digit code, with magic link as fallback). No passwords to reset.
   - *Alternatives:* email + password, or adding Google sign-in, which changes customer experience and support load.
3. **Hostnames and the fate of today's `app.metyet.io` demo.**
   - *Recommended:* `app.metyet.io` becomes the real production app at go-live (Batch 6); the in-memory demo moves to a labelled `demo.metyet.io`.
   - This affects current testers' bookmarks and messaging.
4. **Pilot operating budget.**
   - Approve ~$32–45/month (Supabase Pro + Render Starter, free email and error tiers), with a ceiling of roughly $130/month before re-approval.
   - PITR ($100/month) is explicitly deferred.

---

## 19. Recommended first implementation batch

**Batch 1 — Domain server-readiness** (details in §14).

**Why first:**

- It changes only pure domain code already covered by 2,807 tests.
- It needs no vendor, dependency or UI change, so it can merge while the §18 decisions are made.
- It removes the two things that would otherwise leak into every later batch:
  1. **Client-owned time and ids.** Demo clients send frozen 2026-08 dates.
  2. **The `viewedAt` violation** of a now-locked privacy rule.
- `validateWorld` becomes the executable contract that Batch 2's repository must round-trip.

**Deliverables:**

- `execute(state, actor, command, payload, ctx?)` with `ctx = { now, newId }`, threaded through `rid()`, `appendThreadEntry`, trade-row and inventory id creation, and every `at` default.
- Projection strips the non-actor seat from `viewedAt` (TP and Collector, active and terminal).
- `domain/metyet-world.js` with `validateWorld()`.
- New suite `tests/phase3-domain-readiness.cjs`; `tests/all.cjs` registration; all existing suites green.

**Out of scope:** SQL, server, auth, client changes, seed extraction.

---

### Sources (pricing and platform facts)

- [Supabase pricing (markdown)](https://supabase.com/pricing.md)
- [Supabase pricing in 2026 — UI Bakery](https://uibakery.io/blog/supabase-pricing)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Supabase JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys)
- [Supabase connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase IPv4/IPv6 compatibility](https://supabase.com/docs/guides/troubleshooting/supabase--your-network-ipv4-and-ipv6-compatibility-cHe3BP)
- [Supabase Edge Function limits](https://supabase.com/docs/guides/functions/limits)
- [Render: platforms with a real free tier (2026)](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026)
- [Render pricing — srvrlss](https://www.srvrlss.io/provider/render/)
- [Render pricing — SaaSPricePulse](https://www.saaspricepulse.com/tools/render)
- [Resend pricing — StackScored](https://www.stackscored.com/pricing/transactional-email/resend/)
- [Sentry pricing 2026 — Struct](https://struct.ai/articles/sentry-pricing-error-monitoring-2026/)
- [Vercel Hobby plan (non-commercial)](https://vercel.com/docs/plans/hobby)
- [Neon vs Prisma Postgres pricing 2026](https://www.prisma.io/blog/prisma-postgres-vs-neon-pricing-2026)
- [Firebase pricing 2026 — shiply](https://shiply.now/blog/firebase-pricing-what-you-pay)
- [GitHub Pages limits (SaaS prohibition)](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
