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
nothing:

| Section | From the projection | |
|---|---|---|
| Collector Network | `collectors`, `relationships`, `goals`, `binder`, `invitations` | who is in the network, since when, and how much of theirs you hold |
| Inventory | `inventory` (not archived), joined to `catalog` | your copies, the server's status for each, and your ask |
| Opportunities | `opportunities` (not completed), `collectors`, `catalog` | what is in progress, and the stage the server put it at |

An empty account — a newly registered Trusted Partner with no collectors, no
inventory and no opportunities — is an ordinary case with a sentence per
section, never an error and never invented sample content.

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

The **Collector** production application does not exist. A Collector who signs
in is told so in a sentence and can sign out; they are never shown the demo and
never shown an empty Trusted Partner shell.

## What is deferred, deliberately

**Migrating mutations.** The Trusted Partner shell reads; nothing writes. The
prototype's handlers — the ones that read state back in the same tick, mint ids
with `Date.now()`, and assume a write cannot be in flight — are still there and
still correct for the demo. Each migrates when its workflow does.
