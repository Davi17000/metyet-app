# The production client boundary

Two clients, one codebase. This is the line between them, and why it is where
it is.

## The two realities

`demo.metyet.io` is an **in-memory simulation**. One closure
(`domain/metyet-store.js`) holds the entire canonical world; both seats are
mounted in the same tab and project it for themselves; every mutation is a
synchronous call into the real domain command layer on `prototypeRuntime`,
which trusts caller-supplied ids and timestamps. Scenario controls rewrite the
world directly through `store.fixture`. All of that is correct for a world that
lives in one browser, and none of it is a security claim — both personas' data
sit in one JavaScript object that anyone can open a console on.

`app.metyet.io` is **a server**. The world lives in Postgres, the seat is
whatever the bearer token turns out to be, projection happens server-side
before anything is sent, and a mutation is a round trip that can be in flight,
refused, or fail.

The intended path is one line:

```
verified identity → authenticated API → server command boundary
  → canonical persisted state → server actor projection → React client
```

## The seam

The clients consume exactly three things from a store — `get`, `sub`,
`execute` — and receive it as a prop. So there are two implementations of that
shape, and **a screen moves to production by being handed a different store**,
one screen at a time, rather than by being rewritten.

| | demo store | production store |
|---|---|---|
| `get()` | the whole canonical world | the server's projection, or `null` |
| `execute` | `(actor, command, payload)`, synchronous | `(command, payload)`, async |
| Who decides the seat | the caller, via `actor` | the server, from the bearer |
| Runtime | `prototypeRuntime` — trusts caller ids and clocks | none; the server runs `systemRuntime` |
| `fixture` | present, and needed | **absent** |

## The three modules

**`client/api.js`** — the only place a URL or a token appears. `view()` and
`command(name, payload)`, and nothing else. It sends the bearer and the
command's own payload; it has no parameter for an actor, a seat or a subject,
because the server derives identity from the token it verified and a client
that also sent one would be inviting it to believe a claim. A refusal comes
back as `{ ok: false, refused }` — the domain considered it and said no.
Everything else that goes wrong throws an `ApiError` with one of five words.

**`client/session.js`** — holds a bearer for the life of the tab. It does not
sign anybody in, does not choose storage, and **does not decode the token**:
not for a subject, not for an email, not for the expiry. Who you are is what
the server says when it answers.

**`client/production-store.js`** — the three methods, plus what a round trip
needs and a function call does not: `status()` (`idle | loading | ready |
saving | error`), `version()`, `lastError()`, and a `load()` that shares one
request between concurrent callers. `execute` returns the new projection, so a
handler that used to read the store back in the same tick reads `result.state`
instead.

## What the production client cannot do

Each of these is a property of the construction, and each has a test:

- **Hold the canonical world.** Every value it returns arrived in a response;
  nothing in these files can produce state.
- **Author an actor, seat or subject.** The words do not appear.
- **Run a domain command.** Nothing imports `domain/`.
- **Recreate a projection or visibility rule.** Same.
- **Be written to.** No `fixture`, no `set`, no `reset`. There is no path for
  state that did not come from the server.
- **Mint an id or read a clock.** The server ignores caller ids and timestamps
  under `systemRuntime`, so sending them would only make the UI display ids the
  server never used.

## What the demo keeps

Everything. `demo.metyet.io` builds from the seed, mounts the persona shell,
keeps the scenario controls and the raw state overwrite they need, and imports
none of the above. The isolation runs both ways and is tested from both sides:
nothing in the demo path reaches `client/`, and nothing in `client/` reaches
the demo.

## Signing in

`client/supabase-auth.js` makes three calls to Supabase's own REST endpoints —
`/otp`, `/verify`, `/token?grant_type=refresh_token`, plus `/logout` — and holds
nothing. Two of them are the exact requests `server/auth-signin.js` makes, and a
test asserts the two agree rather than asserting a shape written by hand.

`client/supabase-session.js` holds the session and keeps it alive, behind the
*same* `token()/status()/subscribe()/clear()` contract as `client/session.js` —
so `createApiClient` takes either, and a test uses the injected one while
production uses this.

**Not `@supabase/supabase-js`.** This is not a second authentication system:
Supabase remains the only authority. The library's own defaults are the reason —
it persists the session to `localStorage` and refreshes on a timer, so owning
the storage decision means replacing its adapter anyway: the same surface, plus
a dependency, in a client that has none beyond React.

**No JWT is decoded, ever.** The expiry comes from `expires_at` in the
provider's response body, beside the token. That is how a session renews before
it lapses without the browser deciding for itself what a credential says.

### Where the session lives, and the honest tradeoff

**In memory, and nothing in a browser makes a bearer token immune to XSS.**
Script running on the page can read a closure variable as easily as
`localStorage`, or simply call the API as you. The choice is not safe versus
unsafe; it is **persistence**.

In memory buys two things: nothing is left at rest when the tab closes, and a
session cannot be picked up by a later visit or another tab. It costs one, and
this is the whole cost: **a page refresh signs you out.**

Storage is an injectable adapter defaulting to `NO_STORAGE`, so reversing that
is one argument and a test rather than a rewrite — and so the decision stays
visible instead of being inherited.

### Renewal and ending

An access token lasts an hour, and a Trusted Partner should not be stopped
mid-trade, so the refresh token is held in memory beside the access token — no
worse than holding the access token there. `token()` renews when the provider's
stated expiry is within a minute, and **concurrent callers share one renewal**,
because a refresh token rotates and a second request would present one the
provider has just retired.

A renewal that fails **ends the session**: `token()` answers `null`, and
`api.js` refuses to reach the network without one, so an expired session cannot
become a request that looks anonymous to the server. Signing out revokes at the
source first so the refresh token does not outlive it — and clears **whether or
not that call succeeded**, because sign-out must not be something the network
can refuse.

## The entrance

`client/sign-in/SignIn.jsx` is the production client, and it is seven states:

| | |
|---|---|
| `signedOut` | an address to type |
| `codeSent` | a code to type; the address is shown so a typo is visible |
| `verifying` | the code is with the provider |
| `loading` | signed in, asking the server who this is |
| `ready` | the application, handed the server's projection |
| `failed` | a sentence a person can act on, never the provider's words |

It authors nothing. There is no `partnerId`, no seat, no subject assigned
anywhere in it. It imports no domain, holds no seed, and runs no command.

`ready` is a door, not a destination. It renders `client/production-app.jsx`,
which reads the seat and nothing else, and hands the projection on.

`app-src/main.jsx` wires config → auth → session → api → store → screen, and
adds nothing of its own. `app.build.mjs` builds it to `app/`.

### The three public values

`client/production-config.js` reads `METYET_API_URL`, `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY` as build-time defines. **None is a secret** — the
API's address is where the product lives, the project URL is in every sign-in
email, and the publishable key is published. A browser bundle cannot keep a
secret, so the rule is not "hide these" but *let nothing else in*: a
`sb_secret_` or service-role key is refused, and so is a plaintext address for
anywhere but this machine.

**`METYET_API_URL` is normally unset**, and the client uses the origin it was
served from. That is not a convenience: the production client is served *by* the
API server, so same-origin is correct by construction, and cross-origin is
removed rather than configured.

The build makes the same check the browser makes, so a misconfigured bundle
fails the build instead of the first sign-in.

### Who serves it

The API server. `server/index.js` reads `app/index.html` and `app/main.js` once
at boot and hands them to `createApp`; the not-found handler serves the page for
any non-`/api/` GET and the script for `/main.js`. **Two names, no directory, no
path joined per request** — there is no traversal to attempt because nothing is
read from disk after boot. Anything under `/api/` stays an API error, so a typo
in a client is a 404 rather than a parse failure. A deployment with no built
client serves the API alone and says so once at startup.

## Asking for something to happen

`POST /api/commands` is the server's only write. The client's side of it is
`store.execute(command, payload)` — the same method the demo store has, with a
different implementation behind it — and `client/api.js` is the only place a URL
or a bearer appears.

### The contract, as the server actually states it

| | |
|---|---|
| Body | exactly `{ command, payload }`. Any other top-level key is a **400** |
| Payload | may not contain `actor`, `seat`, `role`, `by`, `account`, `accountId`, `subject`, `sub`, `token` or `at` — a **400** if it does. Nor `__proto__`, `constructor` or `prototype` at any depth |
| Success | `200 { ok, version, value, state }`, where `state` is the projection for whoever the token turned out to be |
| Refusal | `409` with `error.refused` — the domain's own word for the rule |
| Conflict | `409 { error: { code: "state_changed" } }`, **with no `refused`** |
| Auth | `401 unauthenticated`, `403 account_not_provisioned` / `account_disabled` / `actor_unknown` |

**The client never sends a version.** `executeCommand` takes the world lock as
its first statement, reads the version inside that lock, and saves with
`expectedVersion`. `state_changed` is a guard inside the transaction, and when it
fires the transaction has rolled back — so the command did not run.

### Three outcomes, and they are not the same thing

A **refusal** is the domain considering the request and saying no. It comes back
as a value — `{ ok: false, refused }` — because the caller wants the word, and
`store.lastRefusal()` holds it until the next success.

A **conflict** is the world having moved before the save landed. It throws, with
`failure === "conflict"`. Before this batch it fell through to `unexpected` and
was indistinguishable from a reply the client could not read.

**Everything else** throws too, and a thrown `unavailable` means the request
never reached the server.

### What the store does with each

| | `status()` | the projection |
|---|---|---|
| nothing asked for yet | `idle` | — |
| a command in flight | `saving` | **unchanged** |
| the server said yes | `ready` | replaced by the one it returned |
| the domain said no | `ready` | **unchanged**; `lastRefusal()` names the rule |
| the session is over | `error` | **kept**; `lastError()` is `unauthenticated` |
| the world moved first | `conflict` | re-read; `stale()` if that read also failed |
| the network did not answer | `error` | **kept** |

**Nothing is optimistic.** There is exactly one line in `production-store.js`
that assigns `state`, and it assigns what arrived in a response — a test counts
them. A command in flight does not touch the projection, a refusal does not, and
a failure does not blank it.

**A conflict is never replayed.** Re-sending would be easy and wrong: the reason
the world moved is precisely the reason this command may no longer be the right
one. The store re-reads instead — `view()` is a GET and safe to repeat, the
command is not — and the person decides whether to ask again. Nothing in
`api.js` or `production-store.js` loops, sleeps or schedules, and a test asserts
that too.

**One command at a time.** A second `execute` while one is in flight throws
`CommandInFlightError` rather than being sent, because the server has no
idempotency key and two commands in flight are two mutations. `pending()` names
the running command so a control can disable itself and never reach the error.
Reads are not gated — only mutations.

This prevents **concurrent** duplicates and nothing more. A command whose
response is lost may or may not have run, and no amount of client code can tell.
That is why nothing here retries a mutation automatically, and why an
idempotency key on the server is the only thing that would close it.

### Reaching it from a screen

Nothing calls `execute` in production yet, deliberately: every mutation UI is a
later batch. When the first control arrives it should receive a **narrow
callback**, not the store — `client/tp/**` holds no store today and a test keeps
it that way, which is worth more than the convenience of passing one down.

## The application behind the door

### The server's projection is the only product-state input

Everything on a production screen arrived in one `GET /api/view` response.
There is no seed, no shared canonical world, no demo fixture, no sample-data
fallback and no second store. `client/tp/TrustedPartnerShell.jsx` takes a
projection as a prop and nothing else: no store, no session, no api client, no
`fetch`, no `domain/` import. Hand it a projection and it renders; there is no
other way for a value to reach the screen, and a test asserts each absence.

A **rule** is the server's, and a **count** is not. The shell reads
`row.status` for a copy — available, committed, sold — because that is a
canonical answer the server computed; it does not look at opportunities and
work it out, since a second implementation of a rule is a second answer to it.
Counting the rows the server sent, or grouping them by the id they carry, is
reading, and that is allowed.

### Identity comes from `state.actor`, and from nowhere else

`client/actor.js` is the one place the question is asked. A projected actor is a
seat plus the id under that seat's **own** field — `{ seat: "tp", partnerId }`,
`{ seat: "collector", collectorId }`. There is no `actor.id`.

The shop's name is found by matching the actor's id against the projection's own
`partners` records, not by taking the first one: "the first record" is an
assumption about the server, while the actor's id is the server's own answer.

Nothing else can carry an identity in. Not the email that was typed — an address
is how a code was delivered, not who somebody is. Not the URL, not a build
value, not storage, not a prop.

**Everything unknown fails closed.** A missing actor, an unrecognised seat, or a
seat with no id under its own field renders a refusal with a way to sign out,
and no product surface at all. `client/production-app.jsx` ends in that refusal,
so a seat added to the domain later and forgotten here cannot fall through into
somebody else's application.

### Sharing presentation with the prototype

Pure presentation **may** be shared between the demo and production — but only
if it imports no demo state, no store, no domain, and performs no mutation.
Nothing qualifies yet. `src/MetYet.jsx` does not: it defaults `partnerId` to
`"p-self"`, calls `projectForActor` on a canonical world in the browser, mutates
through `store.execute`, and falls back to `buildCanonicalSeed()`. Any of those
four alone would disqualify it. What production reuses from it is its
**information architecture** — the three sections, their order, their titles and
subtitles, and the canonical stage labels — reimplemented against the
projection rather than imported.

### What a Trusted Partner can really see, today

Read-only, and the screen says so rather than offering a button that does
nothing. Each section is its own module under `client/tp/sections/`;
`TrustedPartnerShell.jsx` is the frame around them.

**Collector Network** — for each related collector: their name and city
(`COLLECTOR_FOR_PARTNER`), their preference tags (D-2, the matching profile this
product runs on), the relationship's status and start, **your own** last
contact, binder-review time and private note (`RELATIONSHIP_PARTNER_PRIVATE` —
yours, about your relationship, and nobody else's), how many goals, binder
copies and live opportunities they have with you, and each of their goals with
the tier the server set. Outstanding invitations are a separate list.

**Inventory** — each physical copy as its own row: the catalogue identity for
**its own** `cardId`, whether it is graded or raw as the catalogue states it,
its certificate, its status, your ask, **its own** acquisition cost, and when it
was acquired and added. Archived copies are counted, not listed.

**Opportunities** — in progress and completed as two lists: the collector from
the id the row carries, the card, the stage as the server set it, the goal it
serves, the listed and agreed prices, and — when the deal names an `invId` — the
certificate and cost of **that exact copy**.

Three rules run through all of it:

- **Every join is by identifier.** A relationship, a goal, a card, a copy is
  found by matching the id the row carries. Nothing is matched by position,
  because row order is not a fact the server promised.
- **Acquisition Cost belongs to the exact InventoryCopy.** It is read from the
  row being rendered, never from a `cardId`-keyed lookup — three copies of one
  card bought at three prices are three numbers. It is TP-private (the server
  strips `cost` and `acquired` for everyone else), it is labelled as yours, and
  it is never combined with the ask into a margin. This product does not compute
  profit, and the catalogue's own `value` field is not rendered either: its
  meaning is not established as a market price.
- **An unfamiliar answer survives as itself.** A stage, status or tier this
  build has never seen is shown verbatim and marked unfamiliar, never mapped to
  the nearest known value. The Opportunities list is therefore ordered by
  **date** rather than by lifecycle position — an unfamiliar stage has no place
  in an order this build knows, and inventing one would be the same coercion by
  another route.

An empty account — a newly registered Trusted Partner with no collectors, no
inventory and no opportunities — is an ordinary case with a sentence per
section. A projection missing whole collections, or carrying ragged rows,
renders too. A fact the server did not send is rendered as the **absence of a
line**, never as "—", "never", or a zero.

The layout is blocks of wrapping facts rather than table rows, so nothing
scrolls sideways on a phone and no column collapses to nothing; under 860px the
navigation becomes a strip across the top. A pilot happens on a shop counter.

### What remains for a later batch

Everything that **changes** something. None of it is wired, and none of it is
present as a disabled control pretending otherwise:

- inviting a collector, and accepting or ending a relationship
- adding, editing or archiving an inventory copy
- every Deal Flow action — agreeing a price, selecting and valuing a trade, the
  deal itself, fulfilment
- requesting photos, reviewing a Trade Binder, registering interest
- conversations and outreach

Each will migrate through authenticated `POST /api/commands`, one workflow at a
time. Until a workflow has been migrated and proved, it is prototype-only and is
not production-ready, whatever the shell renders alongside it.

### The Collector application

`client/collector/CollectorShell.jsx` is the Collector's side of the same door.
`client/production-app.jsx` chooses between the two on the seat and nothing
else; a Trusted Partner never reaches the Collector app and a Collector never
reaches the Trusted Partner workspace, both asserted.

**Three sections, which are the product**, in the prototype's own words and
order — the model is settled, and this is a different implementation of it:

| | | count |
|---|---|---|
| **Goals** | what you want, and the only transaction workflow | `goals.length` |
| **Trade Binder** | what you could put into a trade — supply, not a workflow | `binder.length` |
| **Trusted Partners** | the shops you deal with — a network, not a market | `partners.length` |

Each count is a plain row count of a collection the **server** already scoped to
this Collector. None reconstructs a rule.

**There is no opportunities count and no opportunities section**, though the
projection carries them. A deal is a goal being worked, not a fourth thing — and
counting the "active" ones would mean deciding what active means, which is the
server's judgement, not the browser's.

**The shape is the Collector app's, not the Trusted Partner's**: a tab bar along
the bottom of a phone that becomes a rail down the side of a wide screen. One of
these people is at a desk all day and the other is holding a phone in a card
shop.

**Goals** shows each goal with the card it names — identity from `catalog` by
its own `cardId` — its tier, the Collector's own note, and when they started
wanting it. It is also the **one place coordination appears**: an opportunity is
attached to a goal when its `goalId` equals that goal's `id`, and by nothing
else. What is read from it is the stage the server set (rendered in the
product's words, marked when this build does not recognise it), the partner by
explicit `partnerId`, and the prices the server stated. `priceThread`, `trade`,
`deal` and `fulfillment` all arrive and none is opened — reading them would mean
re-deriving a lifecycle the server already decided.

**Trade Binder** shows each copy: card identity, raw or graded as the catalogue
states it, its own certificate, its own reference value (`market`, which the
projection strips for every Trusted Partner, so it is the Collector's alone),
the **server's** `status`, and which Trusted Partners have registered interest —
joined by `binderId`, named by `partnerId`. `photos` holds references, not URLs,
so a copy says in words whether it has pictures and never pretends to show one.

**Trusted Partners** shows the partner profile a related Collector may see
(`PARTNER_FOR_COLLECTOR`) with the relationship's own status and start date,
joined by explicit `partnerId`. **A partner's stock is deliberately not
rendered** although it arrives in the projection: showing "what this shop has"
is a discovery surface, which is a marketplace shape and a product decision
nobody has made.

There is **no Opportunities section and no opportunities count**. A deal is a
goal being worked; giving it its own navigation would make it a second workflow,
and the product has one.

Every join is by an explicit id the row carries. A related row the projection
does not contain yields **nothing** — never the first row, never the nearest
one — and no name or email is ever used as a key.

**Privacy stays the projection's job.** The server scopes `goals`, `binder` and
`interests` to one Collector before sending them. The browser does not re-filter
by `collectorId`: that would re-implement the server's rule and would mask a
server bug rather than surface it. What the browser owns, and what the tests
prove, is that every join is explicit and that no identity can be replaced.

### Why a Collector cannot see a Trusted Partner's figures

Because the projection never sends them, not because the screen declines to draw
them. Checked against a real projection rather than against the comment that
says so:

- **no inventory row carries `cost` or `acquired`** — `INVENTORY_FOR_COLLECTOR`
  strips both, so Acquisition Cost never leaves the server
- **no relationship carries `note`, `last` or `binderReviewedAt`** —
  `RELATIONSHIP_PARTNER_PRIVATE`
- **`collectors` holds exactly one row**, their own, so another Collector's data
  is not in the browser to leak
- **`activity` is empty** — partner-private (D-4)

The shell is the second line, not the only one: it never reads those field
names, and a test hands it a projection that wrongly contains all of them and
asserts none reaches the screen.

## Where Phase 4 finished

The architecture below is complete and joined up end to end. One suite,
`tests/phase4-integration-closeout.cjs`, runs the whole path against a real
migrated Postgres, the real routes, the real domain and the real React
components:

```
Postgres → domain → projectForActor → HTTP → api client → store
  → <SignIn/> → <ProductionApp/> → the seat's own shell
```

Both seats are proved on that path: a token resolves to one actor, that actor
receives one projection, and the projection routes to that seat's product and
no other. The privacy tests there are different in kind from the ones in the
batch suites — those hand a component a projection containing a secret and check
the screen; these put the secret **in the database** and check it never comes
out of the socket, which is where the guarantee actually lives.

**Phase 4 is architecturally complete. It is not the same claim as the product
being usable by every seat**, and the two should not be run together. The
difference is entirely the paragraph below.

### The Collector lifecycle — a Phase 5 dependency, not a Phase 4 defect

A Collector who exists can sign in, be routed, and read their goals, their Trade
Binder and their Trusted Partners. **There is no supported way for a Collector
to come to exist.** Traced through the repository rather than assumed:

| Link | Exists? |
|---|---|
| A credentialed Collector invitation (the analogue of `metyet_auth.partner_invitations`) | **No** — that table and its CLI are partner-scoped |
| A route to redeem one (the analogue of `POST /api/registration/partner`) | **No** — the only registration route creates a *partner* |
| A domain command that accepts an invitation (sets `acceptedAt`) | **No** |
| A domain command that creates a TP↔Collector `relationship` | **No** — none of the forty commands writes one |
| A Collector record created legitimately | **Yes** — `inviteCollector`, TP-only, creating `{ pending: true }` |
| A way to *send* that command in production | **No** — no operator command sends domain commands, and no UI does |
| Binding a verified subject to a Collector actor | **Yes** — `account:link --role=collector` |

Two of those links are missing, so the chain does not close. Nothing in the test
suite closes it either: seeding a Collector into a test world and telling the
account directory about them is **test provisioning**, exactly as
`tests/phase3-server.cjs` has always done, and it is not hosted proof of
anything.

### What is deferred, deliberately

**Migrating mutations.** Both shells read; nothing writes. The command boundary
exists, is fully tested, and has no caller — which is the correct state:
Batch 9's inventory found that every Collector-authored domain command belongs
to a Goals workflow, a Binder workflow, a discovery surface, a negotiation step
or a conversation, and there is no Collector profile or preferences command at
all. The first caller should arrive with the first of those workflows rather
than ahead of it.

**Discovery.** A Collector's projection carries their partners' supply and
nothing renders it. "Who has the card I want" is a real surface and a real
product decision — marketplace framing is what the model warns against — so it
needs deciding rather than drifting into.

**The prototype's handlers** — the ones that read state back in the same tick,
mint ids with `Date.now()`, and assume a write cannot be in flight — are still
there and still correct for the demo. Each migrates when its workflow does.
