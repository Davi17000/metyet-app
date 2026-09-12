# MetYet — deploying the pilot backend

What runs where, what you have to create yourself, and how to check each step.
Everything in **Part 1** works on your Mac with no vendor account. Everything in
**Part 2** costs money or creates an account somewhere, and nothing in this
repository does any of it for you.

The stack is the locked one: Node/Fastify on Render, Postgres and Auth on
Supabase, Resend for sign-in email later. `app.metyet.io` is production and
`demo.metyet.io` is the in-memory demo; they share no state.

---

## Part 1 — local, no vendor needed

```
npm install                 # once, and after any dependency change
npm run verify              # build, full test suite, prod build, smoke, previews
```

To run the server against a Postgres you already have (Postgres.app, Docker, a
local install):

```
export DATABASE_URL='postgresql://localhost:5432/metyet'
export DATABASE_SSL=disable

npm run db:status           # what is applied, and what the world holds
npm run db:migrate          # apply pending migrations (forward-only)
npm run db:bootstrap        # create the EMPTY canonical world
npm run account:list        # the sign-ins that are provisioned
npm run account:link -- --subject=<provider sub> --role=collector --actor=<id>
```

`npm start` also needs `SUPABASE_URL`, because the server verifies real tokens.
Without it the process refuses to start and names what is missing.

**The commands are deliberate and repeatable.** Nothing migrates at startup;
`db:migrate` applies only what is pending and refuses a migration file that
changed after it ran; `db:bootstrap` refuses the moment the database already
holds a world; `account:link` refuses a second active account for a subject or
an actor, and refuses an actor that is not in the canonical world. No command
prints a connection string, a token or a key.

---

## Part 2 — the external actions, one at a time

Each is something only you can do. None is done yet.

### 2.1 Supabase project (Postgres + Auth)

| | |
|---|---|
| **Provider** | Supabase |
| **Create** | One project. Choose a region close to the Render region you will pick. |
| **Setting to copy** | The project URL (`https://<project-ref>.supabase.co`) and the **session pooler** connection string (port 5432 — Render is IPv4-only, and session pooling keeps a transaction and its advisory lock on one connection). |
| **Environment variables** | `SUPABASE_URL`, `DATABASE_URL` |
| **Cost** | Free tier to start; Pro is $25/month and is what a pilot with real data should sit on (daily backups, no pausing). |
| **Check** | `DATABASE_URL=… npm run db:status` prints `schema: not migrated` — that is a successful connection. |

### 2.2 Apply the schema

| | |
|---|---|
| **Provider** | none — this is your command against the database above |
| **Do** | `npm run db:migrate`, then `npm run db:bootstrap` |
| **Cost** | none |
| **Check** | `npm run db:status` prints the applied migrations and `world: version 0, empty`. |

### 2.3 Supabase Auth: asymmetric JWT signing keys

The server verifies tokens against the project's published JWKS and accepts only
asymmetric algorithms. A project still using the legacy shared secret (HS256)
will not be accepted — deliberately.

| | |
|---|---|
| **Provider** | Supabase |
| **Do** | In the project's JWT signing keys settings, migrate the legacy JWT secret into the new key system, create a standby asymmetric key (ES256), rotate to it, and revoke the legacy key once old tokens have expired. |
| **Environment variables** | none — the JWKS URL and issuer are derived from `SUPABASE_URL` |
| **Cost** | none |
| **Check** | `curl https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` returns a key whose `alg` is `ES256` (or `RS256`) with a `kid`. |

Verified against Supabase's documentation (September 2026): the issuer is
`https://<project-ref>.supabase.co/auth/v1`, the JWKS endpoint is
`/auth/v1/.well-known/jwks.json` (edge-cached for ten minutes), a user token's
audience is `authenticated`, and access tokens default to a one-hour expiry.
Those are exactly what `server/config.js` derives and `server/auth/token-verifier.js`
requires, so no change was needed.

### 2.4 Render web service

| | |
|---|---|
| **Provider** | Render |
| **Create** | A web service from `render.yaml` (Render's Blueprints feature reads it), or a Node web service configured by hand with the same four settings. |
| **Settings** | build `npm ci --omit=dev`, start `npm start`, health check path `/api/health/ready`, Node 22 (`.node-version` and `NODE_VERSION`). |
| **Environment variables to set by hand** | `DATABASE_URL`, `SUPABASE_URL`. `DATABASE_SSL=require`, `DATABASE_POOL_MAX=10` and `LOG_LEVEL=info` come from the blueprint. `PORT` is provided by Render. |
| **Cost** | `plan: starter` in the blueprint is about **$7/month** and does not sleep. A free instance sleeps and would make the pilot look broken. Change the plan before applying if you disagree. |
| **Check** | The service reaches "live" (its health check is the readiness endpoint), and `curl https://<service>/api/health/live` returns `{"status":"ok"}`. |

### 2.5 Every release after the first

1. Push to `main` (or trigger a deploy — the blueprint sets `autoDeploy: false`).
2. If the release adds a migration, run `npm run db:migrate` against the
   production database **before** the new version serves traffic — from your Mac
   with the production `DATABASE_URL`, or as a Render one-off job with the same
   environment.
3. Watch `/api/health/ready`. While the schema is behind the code it answers
   `503 {"status":"unavailable","reason":"migrations-pending"}` instead of
   serving errors.

### 2.6 Later, not now

| Action | Why it is not yet | Cost |
|---|---|---|
| **Resend custom SMTP** in Supabase Auth | Sign-in emails are a later batch. Supabase's built-in SMTP only emails project members, at a couple of messages an hour, so real sign-ins need this before launch. | Free tier covers a pilot (3,000 emails/month) |
| **DNS for `app.metyet.io` / `demo.metyet.io`** | The React clients still run the in-memory prototype; there is nothing to point production at yet. | none beyond the domain |
| **Sentry** | Optional. Render's logs are enough for a pilot. | free tier |

**Roughly $32–45/month** once Supabase Pro and a Render Starter instance are
both on, which matches the Phase 3 architecture's budget.

---

## Every setting, in one table

Two of these have to be set by hand and carry something private. The rest have
working defaults, and the server refuses to start rather than guess at the two
that do not.

| Variable | Needed by | Default | What it is |
|---|---|---|---|
| `DATABASE_URL` | every command, and the server | none — required | The Supabase **session pooler** connection string (port 5432). |
| `SUPABASE_URL` | the server only | none — required | `https://<project-ref>.supabase.co`. The issuer and JWKS endpoint are derived from it. |
| `DATABASE_SSL` | both | `require` | `require` (TLS, chain verified), `no-verify` (TLS, chain not verified — only if a provider's CA is unavailable) or `disable` (local Postgres only). |
| `DATABASE_CA_CERT` | both | none | A PEM certificate, only when a provider's CA must be pinned. Supabase's pooler does not need one. |
| `DATABASE_POOL_MAX` | both | `10` | Connections in the pool. Keep it well under the pooler's limit. |
| `DATABASE_STATEMENT_TIMEOUT_MS` | both | `15000` | A single statement is cancelled after this. |
| `DATABASE_IDLE_TX_TIMEOUT_MS` | both | `20000` | An open transaction that stops doing work is cancelled, so the world lock is never held by a dead client. |
| `SUPABASE_JWT_ISSUER` | the server | derived | Override only if the project's issuer is not `<SUPABASE_URL>/auth/v1`. |
| `SUPABASE_JWKS_URL` | the server | derived | Override only to point verification at a different key set. |
| `SUPABASE_JWT_AUDIENCE` | the server | `authenticated` | The audience a user token must carry. |
| `PORT` | the server | `8080` | Render sets this itself; do not set it there. |
| `HOST` | the server | `0.0.0.0` | |
| `LOG_LEVEL` | the server | `info` | |

The three `SUPABASE_JWT*`/`JWKS` overrides exist for a migration or a test rig.
Setting them wrong points verification at keys the project does not sign with,
so leave them alone unless you are deliberately doing that.

---

## What is not possible yet — and why

**There is no way to create the first Trusted Partner.** Production starts from
an empty world by design, and `account:link` refuses to link a sign-in to an
actor that does not exist. But the domain has no command that brings a Trusted
Partner into being: `inviteCollector` creates a pending Collector and only a
partner can send it. Writing that row with SQL would put a record in canonical
state that no command authored, which is the one thing the command layer exists
to prevent — so this batch surfaces the gap instead.

Closing it is a product decision, not a script: MetYet needs an admin-authored
domain command (for example `registerPartner`, run by the founder, invite-only
by construction) with its own rules and tests. Until then the pilot can be
deployed and its health checked, but nobody can sign in as a Trusted Partner.

Also still ahead: the sign-in email itself (one message carrying both a six-digit
code and a one-click link), the React clients calling this API instead of their
in-process store, and photo storage.

---

## If something goes wrong

- **Readiness is 503 with `migrations-pending`** — the migration step was
  skipped. Run `npm run db:migrate`.
- **Readiness is 503 with no reason** — the database is unreachable. Check the
  connection string is the session pooler URI and that `DATABASE_SSL=require`.
- **Every request is 401** — the project is still issuing legacy HS256 tokens,
  or `SUPABASE_URL` points at a different project. Check the JWKS endpoint.
- **Every request is 403 `account_not_provisioned`** — the signed-in subject has
  no account. `npm run account:list` shows what exists.
- **A release must be undone** — redeploy the previous build in Render.
  Migrations are forward-only: undoing one means writing the next migration, or
  restoring the database from a Supabase backup.
