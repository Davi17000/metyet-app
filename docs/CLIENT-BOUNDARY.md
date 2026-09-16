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

## What is deferred, deliberately

**A sign-in screen.** The boundary is provable headlessly and a screen means a
new production build entry point. Wiring "a 401 clears the session and shows
sign-in" belongs there too — `api.js` does not retry, by design.

**Migrating screens.** No component receives the production store yet. The
handlers that read state back in the same tick, mint ids with `Date.now()`, and
assume a write cannot be in flight are still there and still correct for the
demo. Each migrates when its screen does.
