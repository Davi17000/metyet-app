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
export DATABASE_SSL=disable          # a local database, on this machine only

npm run db:status           # what is applied, and what the world holds
npm run db:migrate          # apply pending migrations (forward-only)
npm run db:bootstrap        # create the EMPTY canonical world
npm run account:list        # the sign-ins that are provisioned
npm run account:link -- --subject=<provider sub> --role=collector --actor=<id>

npm run partner:invite -- --email=<address> --name=<store name> [--contact=<person>]
npm run partner:invitations # every invitation, and what became of it
npm run partner:revoke -- --id=<invitation id>

npm run auth:check          # is the identity provider set up the way this server requires?
npm run auth:check -- --token-file=<path>   # ...and does a real sign-in verify, end to end?
```

`npm start` also needs `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, because
the server verifies real tokens and asks the Auth server whether an address was
confirmed. Without them the process refuses to start and names what is missing.

**The commands are deliberate and repeatable.** Nothing migrates at startup;
`db:migrate` applies only what is pending and refuses a migration file that
changed after it ran; `db:bootstrap` refuses the moment the database already
holds a world; `account:link` refuses a second active account for a subject or
an actor, and refuses an actor that is not in the canonical world. No command
prints a connection string, a token or a key.

`partner:invite` is the exception, and deliberately so: it prints the
invitation credential **once**, because only its hash is stored. Nothing —
not the database, not a backup, not a log — can show it again. Send it to the
person yourself; if it is lost, revoke the invitation and issue a new one.

---

## Part 2 — the external actions, one at a time

Each is something only you can do. None is done yet.

### 2.1 Supabase project (Postgres + Auth)

| | |
|---|---|
| **Provider** | Supabase |
| **Create** | One project. Choose a region close to the Render region you will pick. |
| **Setting to copy** | The project URL (`https://<project-ref>.supabase.co`), the **session pooler** connection string (port 5432 — Render is IPv4-only, and session pooling keeps a transaction and its advisory lock on one connection), and the project's **publishable** key (`sb_publishable_…`). Not the secret key: the server refuses one. |
| **Environment variables** | `SUPABASE_URL`, `DATABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `DATABASE_CA_CERT`/`DATABASE_CA_CERT_FILE` (2.1a) |
| **Cost** | Free tier to start; Pro is $25/month and is what a pilot with real data should sit on (daily backups, no pausing). |
| **Check** | `DATABASE_URL=… npm run db:status`. A TLS error here is expected until 2.1a; after it, `schema: not migrated` is a successful connection. |

### 2.1a The database's certificate

Supabase signs its database certificate with **its own root**, which is not one
of the authorities Node trusts out of the box. So a verified connection needs
that root — and until it has one, every command fails closed with
`SELF_SIGNED_CERT_IN_CHAIN`. That is the check working, not a fault.

| | |
|---|---|
| **Provider** | Supabase → Project Settings → Database → **SSL Configuration** |
| **Do** | Download the server root certificate (a `.crt` file). It is a public root, not a secret — but it is not committed either, because it is environment and because it rotates. |
| **Locally** | `export DATABASE_CA_CERT_FILE=/path/to/that/file.crt` |
| **In Render** | paste the file's text into `DATABASE_CA_CERT` (the blueprint declares it, unset) |
| **Cost** | none |
| **Check** | `npm run db:status` prints `schema: not migrated` instead of a TLS error. |

Do **not** reach for `DATABASE_SSL=no-verify` to get past this. Unverified, the
connection is still encrypted but to nobody in particular: anything that can
answer for the host reads and rewrites everything on it, database password
included. The certificate is a thirty-second download.

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
| **Do** | In the project's JWT signing keys settings, migrate the legacy JWT secret into the new key system, create a standby key on **ES256** (or RS256 — those two, and no others, are what the server accepts), rotate to it, and revoke the legacy key once old tokens have expired. |
| **Environment variables** | none — the JWKS URL, the issuer and the user endpoint are derived from `SUPABASE_URL` |
| **Cost** | none |
| **Check** | `SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… npm run auth:check` prints the issuer, audience and accepted algorithms, and requires at least one key on **ES256 or RS256** — the exact list the server verifies with. It fails while the project is on the legacy shared secret, and equally if the project's key is asymmetric but on another algorithm (ES384, PS256, EdDSA), because every token signed with one of those would be refused. |

Verified against Supabase's documentation (September 2026): the issuer is
`https://<project-ref>.supabase.co/auth/v1`, the JWKS endpoint is
`/auth/v1/.well-known/jwks.json` (edge-cached for ten minutes), a user token's
audience is `authenticated`, and access tokens default to a one-hour expiry.
Those are exactly what `server/config.js` derives and `server/auth/token-verifier.js`
requires, so no change was needed.

If the Supabase project is still issuing legacy HS256 tokens, or if it is on
the legacy `anon`/`service_role` API keys, both are worth migrating before the
pilot: the server refuses HS256 outright, and refuses a secret key where the
publishable one belongs.

### 2.3a The sign-in email: one message, a code and a link

The locked experience is one email carrying **both** a six-digit code and a
one-click sign-in link. Supabase supports this, and it is template
configuration — no code change and no product compromise:

| | |
|---|---|
| **Provider** | Supabase → Authentication → Email Templates → **Magic Link** |
| **Do** | Put both `{{ .Token }}` (the six-digit code) and `{{ .ConfirmationURL }}` (the one-click link) in that one template. |
| **Why it works** | Email OTPs and Magic Links share one implementation and one underlying token. The client verifies a typed code with `verifyOtp({ email, token, type: 'email' })`, and GoTrue's `email` verification deliberately checks **both** the confirmation and recovery token columns — so a code from a magic-link request verifies. Clicking the link and typing the code are two doors to the same token. |
| **Consequence** | Whichever is used first spends the token and the other stops working. That is correct: one sign-in, one credential. |
| **Cost** | none |
| **Check** | Send yourself one. The email contains a code and a link; either signs you in, and the second then fails. |

`signInWithOtp` must keep creating users (`shouldCreateUser` left at its
default) — an invited Trusted Partner has no account until their first sign-in.
That is not a way in: an auth user is not a MetYet actor, and only an invitation
creates one.

### 2.3b Proving one real sign-in, before anyone is invited

`auth:check` on its own certifies the signing side. To certify the whole path —
a real email, a real session, a real confirmed address — it needs a real token,
and getting one used to mean pasting a session out of a browser console. That is
how an access token ends up in a clipboard and a screenshot, so there is a
command instead.

| | |
|---|---|
| **Provider** | Supabase (this only asks it to email you) |
| **Do** | `npm run auth:sign-in -- --email=<your address>` |
| **Then** | The email arrives with a code and a link. Type the **code** at the prompt — it is not echoed. The access token is written to `.secrets/access-token`, mode 0600, and never printed. |
| **Check** | `npm run auth:check -- --token-file=.secrets/access-token` — it verifies the signature against the project's JWKS, the issuer, the audience and the expiry, then asks the Auth server whether that address is confirmed. |
| **Cost** | none |

The request carries the address and nothing else: no `create_user`, so the
project's own signup policy decides whether a first-time invited address may be
created. Verification uses `type: "email"`, which is what makes a code from the
Magic Link template work (2.3a).

Only one of the two doors can be used. Taking the code here spends the
credential and the link in the same email stops working; to exercise the link
instead, run `auth:sign-in` again for a **fresh** email and follow the link
rather than typing the code — the session lands in the browser, not in the file.

This is not a way into MetYet. It produces the same ordinary user session the
sign-in page will, with the publishable key, and a Supabase auth user is not a
MetYet actor: only redeeming an invitation makes one. It reaches no database, it
has no HTTP route, and it refuses to write the token anywhere git does not
ignore. Delete the file when you are done — it expires on its own, but sooner is
better.

### 2.4 Render web service

| | |
|---|---|
| **Provider** | Render |
| **Create** | A web service from `render.yaml` (Render's Blueprints feature reads it), or a Node web service configured by hand with the same four settings. |
| **Settings** | build `npm ci --omit=dev`, start `npm start`, health check path `/api/health/ready`, Node 22 (`.node-version` and `NODE_VERSION`). |
| **Environment variables to set by hand** | `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `DATABASE_CA_CERT` (the certificate's PEM text — paste the whole file). `DATABASE_SSL=verify-full`, `DATABASE_POOL_MAX=10` and `LOG_LEVEL=info` come from the blueprint. `PORT` is provided by Render. |
| **Cost** | `plan: starter` in the blueprint is about **$7/month** and does not sleep. A free instance sleeps and would make the pilot look broken. Change the plan before applying if you disagree. |
| **Check** | The service reaches "live" (its health check is the readiness endpoint), and `curl https://<service>/api/health/live` returns `{"status":"ok"}`. |

### 2.5 The first Trusted Partner

MetYet decides who this is. There is no page anyone can find and no form anyone
can fill in: the only way into the network is an invitation you issue.

| | |
|---|---|
| **Provider** | none — your command against the production database |
| **Do** | `npm run partner:invite -- --email=<their address> --name=<their store> --contact=<their name>` |
| **Then** | Email them yourself: what MetYet is, that they were chosen, and the credential the command printed. The wording that matters — "You've been invited to become a MetYet Trusted Partner" — is yours to write; nothing in the system sends it. |
| **They** | sign in with that address, and accept. That single act creates their Trusted Partner, binds their sign-in to it, and spends the invitation. |
| **Cost** | none |
| **Check** | `npm run partner:invitations` shows it as `accepted`, with the partner id it created. `npm run account:list` shows their sign-in. |

**Before sending the first one, note who can receive it.** Supabase's built-in
email service refuses to deliver to anyone who is not a member of the project —
at two messages an hour — so the first Trusted Partner can be **you**, at an
address on the project team, with no email provider configured at all. Inviting
anyone else needs custom SMTP first (2.7).

The credential is printed once and stored only as a hash; a lost one is
replaced by `partner:revoke` and a fresh `partner:invite`, never recovered.
It expires in 14 days by default (`--days=`, up to 90), is single-use, and is
not a way to sign in: once they have registered, their own verified sign-in is
what they use.

**Their address must be one Supabase has confirmed, and it must be the one you
invited.** That is checked by asking the Auth server about them, not by reading
their token — see "Why the publishable key is needed" below.

### 2.6 Every release after the first

1. Push to `main` (or trigger a deploy — the blueprint sets `autoDeploy: false`).
2. If the release adds a migration, run `npm run db:migrate` against the
   production database **before** the new version serves traffic — from your Mac
   with the production `DATABASE_URL`, or as a Render one-off job with the same
   environment.
3. Watch `/api/health/ready`. While the schema is behind the code it answers
   `503 {"status":"unavailable","reason":"migrations-pending"}` instead of
   serving errors.

### 2.7 Later, not now

| Action | Why it is not yet | Cost |
|---|---|---|
| **Resend custom SMTP** in Supabase Auth | Required before anyone outside the project team can sign in: the built-in service refuses non-members and allows two messages an hour, and Supabase documents it as best-effort and not for production. Sending the *invitation* is still yours to write by hand. | Free tier covers a pilot (3,000 emails/month) |
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
| `SUPABASE_URL` | the server only | none — required | `https://<project-ref>.supabase.co`. The issuer, the JWKS endpoint and the user endpoint are derived from it. |
| `SUPABASE_PUBLISHABLE_KEY` | the server only | none — required | The project's **publishable** key (`sb_publishable_…`), or its older name `SUPABASE_ANON_KEY`. It is the `apikey` header the provider's gateway requires when registration asks whether an address was confirmed. It is safe to hold — it grants nothing by itself, and the authority in that call is the person's own token. **A secret or service-role key here is refused, not used.** |
| `DATABASE_SSL` | both | `verify-full` | `verify-full` (encrypt, verify the certificate chain **and** the host name), `no-verify` (encrypt, verify nothing — only where a provider's CA genuinely cannot be obtained) or `disable` (local Postgres only). Named as libpq names them. **`require` is refused**: libpq's `require` means "do not verify", and it used to mean "verify" here — so rather than guess which you meant, the server asks. |
| `DATABASE_CA_CERT` | both | none | The provider's CA as PEM text. **Supabase needs this**: it signs with its own root, which is not in Node's trust store. |
| `DATABASE_CA_CERT_FILE` | both | none | The same certificate as a path to the `.crt` you downloaded — the convenient form on a laptop. Set one or the other, not both. |
| `DATABASE_POOL_MAX` | both | `10` | Connections in the pool. Keep it well under the pooler's limit. |
| `DATABASE_STATEMENT_TIMEOUT_MS` | both | `15000` | A single statement is cancelled after this. |
| `DATABASE_IDLE_TX_TIMEOUT_MS` | both | `20000` | An open transaction that stops doing work is cancelled, so the world lock is never held by a dead client. |
| `SUPABASE_JWT_ISSUER` | the server | derived | Override only if the project's issuer is not `<SUPABASE_URL>/auth/v1`. |
| `SUPABASE_JWKS_URL` | the server | derived | Override only to point verification at a different key set. |
| `SUPABASE_USER_URL` | the server | derived | Override only to point the confirmed-address check at a different Auth server. |
| `SUPABASE_JWT_AUDIENCE` | the server | `authenticated` | The audience a user token must carry. |
| `PORT` | the server | `8080` | Render sets this itself; do not set it there. |
| `HOST` | the server | `0.0.0.0` | |
| `LOG_LEVEL` | the server | `info` | |

The `SUPABASE_JWT*`, `JWKS` and `USER_URL` overrides exist for a migration or a
test rig. Setting them wrong points verification at keys the project does not
sign with, or asks the wrong server who somebody is, so leave them alone unless
you are deliberately doing that.

### Why the publishable key is needed, and why it is only that

Registration has to know that the provider **confirmed** the address a person is
redeeming an invitation with — not merely what address their token says. A
Supabase access token cannot establish that: its documented claims contain no
`email_verified` at any level, and the one that appears in practice sits inside
`user_metadata`, which any signed-in user can write to. Believing it would let
anyone with any sign-in claim any invited address.

So the server asks the Auth server instead — `GET /auth/v1/user`, carrying that
person's own verified token — and believes only `email_confirmed_at`, which
Supabase sets and no user can write. That request needs an `apikey` header,
which is the only reason this key exists in the configuration. It is the
publishable key precisely because it is not authority: the person's token is.

---

## How a Trusted Partner comes into being

Production starts empty and `account:link` refuses to link a sign-in to an actor
that does not exist — which is right, and which used to mean the first Trusted
Partner could not be created at all. An invitation is what closes that, and it
closes it without loosening anything:

1. **You invite them.** `partner:invite` records the decision and mints a
   single-use credential. The store's name is written here, by MetYet, because
   MetYet approved it — not typed in later by whoever holds the credential.
2. **You send it.** Today, by hand. What you write is the invitation; nothing
   about it is automated yet.
3. **They accept.** They sign in normally, and `POST /api/registration/partner`
   takes the credential. In one transaction it spends the invitation, creates
   their Trusted Partner through the domain, and binds their sign-in to it. Any
   failure rolls all three back and the invitation is still theirs to use.
4. **They start.** An empty shop, and the first useful thing to do with it is
   add inventory.

The guarantees, in one place: the credential is never stored, only hashed; it is
single-use, expiring and revocable; the redeemer's address must be the one
invited and the provider must have verified it; one sign-in remains one actor;
and nothing about the request decides the partner's name or id. There is no
route that creates an invitation, and registration is not a command, so no
request body can name it.

Still ahead: sending that invitation email from the product rather than from
you, the sign-in email itself (one message carrying both a six-digit code and a
one-click link), inviting Collectors from a Trusted Partner who has inventory,
the React clients calling this API instead of their in-process store, and photo
storage.

---

## If something goes wrong

- **Readiness is 503 with `migrations-pending`** — the migration step was
  skipped. Run `npm run db:migrate`.
- **Readiness is 503 with `schema-integrity`** — a migration file that had
  already been applied was edited afterwards, so the database and this build no
  longer agree about the schema. Restore the original file and add a new
  migration; `npm run db:status` names the migrations that drifted.
- **Readiness is 503 with no reason** — the database is unreachable, or refused
  the connection. This is deliberately *not* reported as a missing migration.
  Check the connection string is the session pooler URI, and that the CA
  certificate is configured (below).
- **`self-signed certificate in certificate chain` / `SELF_SIGNED_CERT_IN_CHAIN`** —
  that is certificate verification **working**. Supabase signs its database
  certificate with its own root, which is not in Node's trust store, so it has to
  be supplied. Download it from the dashboard (Database Settings → SSL
  Configuration) and set `DATABASE_CA_CERT_FILE` to its path locally, or paste
  its text into `DATABASE_CA_CERT` in Render. `db:status` says all of this when it
  happens. Do **not** set `no-verify` to get past it: unverified, anything that
  can answer for the host reads and rewrites the connection, password included.
- **`ERR_TLS_CERT_ALTNAME_INVALID`** — the certificate is valid but not for this
  host. The host in `DATABASE_URL` is not the one it was issued for, or the CA is
  the wrong one.
- **Every request is 401** — the project is still issuing legacy HS256 tokens,
  or `SUPABASE_URL` points at a different project. Check the JWKS endpoint.
- **Every request is 403 `account_not_provisioned`** — the signed-in subject has
  no account. `npm run account:list` shows what exists.
- **A release must be undone** — redeploy the previous build in Render.
  Migrations are forward-only: undoing one means writing the next migration, or
  restoring the database from a Supabase backup.
