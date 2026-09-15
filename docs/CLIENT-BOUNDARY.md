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

## What is deferred, deliberately

**Signing in.** There is no sign-in UI and no auth code in the browser. The
session takes an injected token, so the choice between the provider's client
library and two fetch calls of our own — a real dependency decision — is made
in the batch that has a screen to attach it to, not inherited from a line
written here.

**Where a token lives across a refresh.** In memory only, today. Keeping
somebody signed in across a reload is worth having and has a cost, so it is
decided alongside refresh rather than now.

**Migrating screens.** No component receives the production store yet. The
handlers that read state back in the same tick, mint ids with `Date.now()`, and
assume a write cannot be in flight are still there and still correct for the
demo. Each migrates when its screen does.
