# MetYet

A prototype of a trading-card marketplace built around one idea:

> **One mutation → one canonical state change → two persona perspectives → no synchronisation.**

MetYet has two experiences. A **Trusted Partner** runs a card business: a network
of collectors, held inventory, deals in flight. A **Collector** is chasing a
handful of cards from people they trust. They are deliberately different products
— an operational workbench and a consumer collecting app — and they run on
**one shared domain**. A goal stated by a collector *is* the demand a partner
sees. There is no copying, no mirroring, no sync step.

---

## Quick start

```bash
npm install
npm run verify
```

`verify` builds every bundle, runs all 883 tests, produces the minified
production build, runs the smoke test, and regenerates both previews.

| Script | What it does |
|---|---|
| `npm run build` | Compiles the bundles the test suites need |
| `npm test` | Runs all suites (**883 tests**) |
| `npm run prod` | Minified production build of the Trusted Partner app |
| `npm run smoke` | Renders the production build and checks key strings |
| `npm run previews` | Regenerates the single-file preview artifacts |
| `npm run verify` | All of the above, in order |

---

## Layout

```
domain/          THE SHARED DOMAIN — one source of truth
  metyet-domain.js     identity, lifecycle, settlement, turn ownership, invariants
  metyet-entities.js   partners, interest, conversations, persona projections
  metyet-store.js      canonical state and the one action per operation
  collector-view.js    Collector persona selectors (presentation only)

src/MetYet.jsx                  Trusted Partner experience + the canonical seed
collector/MetYetCollector.jsx   Collector experience
shell/MetYetPrototype.jsx       Unified shell: one store, two perspectives

tests/           883 tests. See "Testing" below.
dist/            BUILD OUTPUT ONLY — regenerated, never edited
METYET-DOMAIN-CONTRACT.md       What must stay true in production
```

### Where the rules live

Matching, the opportunity lifecycle, turn ownership, settlement arithmetic,
goal state and the invariants are all in `domain/`. Neither persona
reimplements any of them. If you find business logic in a component, that is a
bug — move it down.

Persona-specific **visibility** is also a domain concern, not a UI convention.
`binderCopyForPartner` strips the collector's private valuation structurally, so
a Trusted Partner surface cannot leak it even by accident.

---

## The shared universe

Both personas read one seed, built by `buildCanonicalSeed()` in `src/MetYet.jsx`.

- The Trusted Partner is **`p-self`** (Northline Cards) — one partner row among
  several, not a privileged singleton.
- The Collector is **`c12`** (Casey Lin) — a collector inside that same network,
  not a fixture. Her goals, binder copies, interest relationships and
  opportunities are the ones the partner sees.

Inventory is partner-owned, so every Trusted Partner surface scopes to the
active partner while other partners' stock lives in the same collection.

---

## Testing

```bash
npm test
```

The suites are layered, and the layering is deliberate:

| Layer | Files | Proves |
|---|---|---|
| Product behaviour | `agree-price`, `select-trade`, `value-trade`, `trade-pct`, `workspace`, `collector`, … | each experience behaves correctly |
| Domain | `shared-state.cjs` | invariants, lifecycle, settlement, the A–O contract |
| Component | `cross-persona.cjs` | both components read the same records |
| Shell | `unified.cjs` | one store instance, no reseed on persona switch |
| End to end | `e2e-unified.cjs` | all fifteen A–O scenarios through the rendered shell |

Tests are written to fail loudly when the architecture regresses, not merely
when a render changes. Several assert against source — that no component holds a
canonical collection in local state, that no `sync`/`mirror` step exists, that
the private valuation field is absent rather than blanked.

**Sabotage-checked.** Replacing the shell's store `useRef` with a per-render
`createStore` makes 13 of 15 end-to-end scenarios fail. The suite detects a
shell that quietly rebuilds reality.

---

## Previews

`npm run previews` generates two single-file artifacts for environments that
cannot resolve module imports:

- `dist/MetYetCollector.preview.jsx`
- `dist/MetYetPrototype.preview.jsx` — the full unified prototype

Both carry a **GENERATED PREVIEW — DO NOT EDIT** header listing their inputs.
They are build output. Change the modules and regenerate; never edit a preview,
and never treat one as a source of truth.

---

## Before changing anything

Read `METYET-DOMAIN-CONTRACT.md`. It separates what must remain true in
production — entities, identity rules, visibility, the lifecycle, the eleven
invariants, derived state — from prototype scaffolding that should not be
carried forward (the in-memory store, seed fixtures, id formats, single-file
components).

Two rules worth repeating here:

**Card identity is exact.** Name, set, printed number, print, edition, language
and grade — plus condition when raw. A PSA 9 and a PSA 8 of the same printing are
different cards. Loosening this in one place silently changes what every other
surface means.

**Derive, don't store.** Goal state, turn ownership, matching, trade value and
cash balance are all computed. Storing any of them creates a second source of
truth that will drift.
