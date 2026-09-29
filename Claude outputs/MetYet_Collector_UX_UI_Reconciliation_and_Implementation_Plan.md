# MetYet — Collector UX/UI Reconciliation & Implementation Plan

**Read-only audit and planning batch. No product code was changed.**

---

## A. Executive summary

**Starting SHA: `153ce14ec73814f291d9f150bb61ae26d759d49e`**, branch
`phase-5-option-b-copy-availability`, **worktree clean**.

**Baseline: 135 suites, 4,565 tests, 0 failures.** Production build OK
(341,629 bytes), production smoke OK.

**Option B and the post–Option B cleanup are both present in the code**, not
only in their hand-backs: `copyPendingFor`, `copyInLiveDeal`, `setCopyPending`,
`copyBlockedFor`, `shapeCopyRefusal`, `protectedCopyEdit`,
`photographsRewritten` are all live in `domain/metyet-commands.js`, and
`metyet-world.js:482` carries the `finalAgreementGiven` predicate. Their
hand-backs are in `Claude outputs/`. **The repository does not materially differ
from what those documents describe**, with one exception noted in §K: the
*Deal Flow Architecture Reconciliation* doc still describes the pre–Option B
commitment boundary and is stale on that point.

### The overall split

**The visual target is overwhelmingly presentation work, but the Deal Flow tab
is not, and two verified defects sit underneath it.**

| Category | Share of the target | Notes |
|---|---|---|
| Visual / presentation only | **~60%** | Browse grid, card detail, Binder, Your Cards, Trusted Partners, the whole look |
| Existing projection adaptation | ~10% | Adding two fields to a catalog read; regrouping discoveries |
| New derived projection | ~5% | An "Available from TPs" card-first lens; cross-Binder view derivations |
| Existing behaviour needing production exposure | ~15% | Inspect, Photos, Market Value, Pending — **0 of 21 deal and qualification commands are exposed** |
| Existing domain behaviour extension | ~7% | Criteria as a filter; releasing a goal from a dead deal |
| **Genuine domain-model change** | **~3%** | Pokémon species / generation. Nothing else. |

**Almost nothing you want requires a new domain concept.** The model already
carries every truth the target UX needs to express, with exactly one exception
(species/generation) and one absence that is a product decision rather than a
gap (PC).

### The three findings that change the plan

All three were verified by my own probe against the real domain, not taken from
a report.

**1. Exact matching does not exist.** A Goal for `PSA 10` produces a discovery
against a `PSA 1` copy, and `startOpportunity` on that copy **succeeds**.
`discoveriesIn` reads `desired` not at all. Your brief's rule — *"not a weaker
match; it is not a match"* — is **not** current behaviour, and the current
behaviour is **deliberate and pinned by two tests** whose failure messages read
`"desired criteria became a filter"` (`tests/phase5-c32-goal-criteria-grading.cjs:566`)
and `"criteria filtered the overlap"` (`tests/phase5-c35-close-the-loop.cjs:726`).
This is a product conflict, surfaced in §K, not silently resolved.

**2. A losing deal becomes a permanent, silent lock on the Goal.** Two
Collectors legitimately pursue one copy. One reaches Final Agreement. The
other's Opportunity remains `stage: "agree-price"`, `declined: false` — alive
and unmarked:

```
copy status:                              committed
Casey's opp:                              {stage:"agree-price", declined:false}
Casey proposePrice:                       copy-unavailable      ← caused by the rival
Casey pursues the SAME card elsewhere:    already-negotiating
Casey demotes the goal:                   goal-locked
Casey deletes the goal:                   goal-locked
after she manually cancels:               OK
```

**A correction to my own first reading of this, which an adversarial pass
caught.** The last three lines are *not* caused by losing. A control run with no
rival at all, on a copy that is still `available`, produces them too:

```
start on i1:                   OK        copy status: available
pursue same card, other shop:  already-negotiating
demote the goal:               goal-locked
delete the goal:               goal-locked
```

`activeOppForGoal`, `goalLocked` and `oneNegotiationPerGoal`
(`metyet-domain.js:104,701,1372`) take only `opps` — they cannot see the copy, so
no rival's state is an input. They fire the moment the Collector's *own*
opportunity reaches `agree-price`. That is the deliberate one-negotiation-per-Goal
invariant, and §F lists it correctly as an intended gate.

**What losing actually changes is narrower, and is still a real defect: the lock
stops being temporary.** Normally a Collector ends their own negotiation and the
Goal frees. Here the negotiation can never conclude — every economic command
refuses — so the lock is permanent until they manually cancel a deal nothing ever
told them had died. The fix is therefore a **narrow dead-deal exclusion inside an
intended invariant**, not a relaxation of it.

**3. Requested photographs arrive into a hole.** Casey requests photos; the
partner marks the copy Pending for a different deal; the partner uploads; her
request is stamped `fulfilledAt` — and her inventory row is `null`, so she
cannot see the photograph she asked for.

### The likely practical blocker — unmeasured from here

**No catalog data is checked in anywhere, and the sole write path is an operator
CLI** — both verified. C9.1 concluded from that, and from production probes, that
the production catalog was never populated, and its load-bearing claims
re-verify. **Nothing in this worktree can measure a production database**, so
"empty" remains an inference, not a measurement. If it holds, Browse has nothing
to browse until the import runs, and the import is blocked on a **commercial**
confirmation rather than on engineering. C9.1's cheap check — three signed-in
URLs reporting `total: 0` — is still the thing to do. See §K.4.

---

## B. Current-state audit

### Navigation and shells

**Production is `app-src/main.jsx` + `client/**` and nothing else.** `src/`,
`shell/`, `collector/`, `shared/`, `dev/`, `site-src/` are the demo
(`demo.metyet.io`) or dead. `src/main.tsx` + `vite.config.ts` + `tailwind.config.js`
are a leftover Bolt/Vite scaffold whose dependencies are not even installed —
**Tailwind is not used in production.**

Collector navigation is four tabs in `client/collector/CollectorShell.jsx:71-109`:
**Browse · Binder · Your Cards · Trusted Partners**. No router — plain `useState`,
no URL, no bookmarkability. `DEFERRED_SECTIONS` (`:127-143`) holds exactly one
entry, `goals`, which is bundled but unreachable.

**A known state-loss defect:** every section change unmounts the section, losing
the open binder, filters, and — costly — the `described` canonical-card cache, so
**each tab switch re-issues catalog reads**. The shell already lifts three pieces
(`browseSession`, `fillingBinder`, `section`) above the boundary; the remedy is
to lift the rest. C9.2 recorded this and corrected an earlier wrong diagnosis:
`<main key={section}>` is *not* the cause — `<View/>` resolves to a different
component type per section, so React unmounts regardless.

### Browse, search, catalog

**The canonical chain is sound**: Expansion → Card Context → Canonical Card →
Physical Copy, with opaque minted ids (`xp- cx- cc-`), natural keys for
"is this the same card", and provider ids confined to one table
(`metyet_catalog.source_mappings`) and blocked at the HTTP boundary.

**Search is three separate systems, not one.** `GET /api/card-contexts` takes
five AND-combined filters with *different* semantics:

| Param | Semantics | Probe |
|---|---|---|
| `query` | substring, **card name ONLY** | `"zard"`→Charizard; `"Base Set"`→**0**; `"Arita"`→**0** |
| `expansion` | name substring **OR** code exact | `"base"`→2; `"ase1"`→**0** |
| `artist` | **whole-string exact** | `"Mitsuhiro Arita"`→2; `"Arita"`→**0** |
| `pokedex` | jsonb containment | `"25"`→2 |

There is no single box that searches name + set + artist. The only one-box
multi-field search in the repo (`D.searchCards`) runs over the **84-row demo
seed in the browser** and is not reachable from production.

**Artist is in the model** (`card_contexts.artist`, indexed) — presentation, not
identity. **Pokémon species is not.** `pokedex_numbers[]` is the only handle;
nothing maps 25 → "Pikachu", and there is **no generation concept anywhere**.

**Artwork** lives on the canonical card (`image_small`/`image_large`), comes from
the import unvalidated, and is handled well when absent or broken by
`client/card-art.jsx`, which falls back to a same-size name plate so nothing
shifts.

### Binders, Goals, ownership

The model states four independent facts, and defends the independence
explicitly in code comments, migrations, `domain/README.md` and seven test
scenarios:

```
Binder         this card belongs here
Goal           I want this card
CollectorCopy  I own this physical copy
offered        I am willing to trade or sell that copy
```

- **Goal**: `{id, collectorId, canonicalCardId, tier, createdAt, since, note, desired}`.
  **No `binderId`.** `tier` is `primary|secondary` and governs only wording and a
  deal lock. `desired` is **exactly `{grade, condition}`** — any other key is
  refused. Print/language/edition are *not* criteria; they are identity, folded
  into `canonicalCardId`, so wanting 1st Edition vs Unlimited is two Goals.
- **Binder membership is a join record** naming the **canonical card** — never a
  Goal, never a copy, deliberately, so that satisfying a goal or selling a copy
  cannot silently unfile a card. A card may be in several Binders. The only
  lifecycle axis is `archivedAt` (a timestamp, not a boolean); **there is no
  delete command in the domain at all**.
- **Goal identity is NOT dependent on Binder membership** — verified three ways
  (record, command, probe). The only coupling is a *read path*: since C3.4b,
  Goals are reached through Binder, including a derived "Not in a binder yet"
  list. Nothing is persisted for it.
- **CollectorCopy** carries `offered` (mandatory boolean, one door:
  `setCollectorCopyOffered`), `market` (the owner's private reference value,
  never projected to a partner), grade/condition/cert/photos. Statuses
  (`available|reserved|committed|traded`) are **derived, never stored**.

**Durable Pending Interest does not exist and never did** — `git log -S` and
`--grep` both return nothing. `setInterest`/`interests` is a **TP's** signal
about one exact CollectorCopy (and its `binderId` field is legacy naming for a
*copy* id, not a Binder). Browsing creating no durable record is a stated,
repeatedly-pinned invariant: *"nothing searched, filtered, viewed or clicked
produces one"*. **Confirmed: durable Pending Interest is unnecessary, and
introducing it would break a settled invariant rather than fill a gap.**

### Matching, Deal Flow, lifecycle

`discoveriesIn` (`domain/metyet-discovery.js:140-183`) is the **only** matching
engine reachable from production. It keys on four things: an explicit Goal with a
canonical id; supply that is `archived !== true && status === "available"`; an
accepted relationship; and **strict canonical-id equality**. Output is grouped by
the **(goalId, partnerId) pair**, carrying `invIds[]` and `copies`, with no
score, rank, price or recency. Computed, never stored.

It does **not** read `desired`. Verified.

Three other matching implementations exist (`partnersWith`, the demo's
eight-dimension `identityKey`, `E.partnersHolding`) — **all prototype-only and
unreachable from production**. They embed a *different* semantic (grade and
condition as part of identity, and "one best copy per partner"), so porting
prototype UI naively would import that semantic.

**The lifecycle is complete and heavily tested**: `agree-price → select-trade →
value-trade → deal → fulfillment → completed`, with `nextActor` as the single
seat-neutral turn authority and no stored turn field.

**Exposure is the wall.** 50 domain commands, **18 exposed**. **Zero of the 18
deal-lifecycle commands** (`startOpportunity` … `cancelOpportunity`, including
`chooseCashOnly`). **Zero of the three qualification commands** (`reviewCopy`,
`endReview`, `requestPhotos`) — 21 in all. `setCopyPending` is not exposed
either, nor is `cancelOpportunity`. A Collector in
production today cannot start, progress, inspect or end anything.

**There is no Collector-facing deal UI in production at all.** What exists:
`TrustedPartners.jsx` renders "X has N cards you're looking for" from
`discoveries`, read-only by design. `Goals.jsx` (unreachable) would show stage
labels and three price facts.

**Every input a deal surface needs is already in the browser** and never
rendered: `discoveries[].invIds`, and the full `inventory[]` rows with
`grade, condition, ask, cert, photos` and a derived `status`.

### Naming collision to resolve

The product term **"Agree Market Value"** means the `agree-price` stage —
`startOpportunity` → `proposePrice` → `acceptPrice` → `agreedPrice`. The commands
literally named `proposeMarketValue` / `acceptMarketValue` are something else
entirely: per-trade-card valuations inside `value-trade`. **One of the two must
be renamed** before this vocabulary reaches a screen.

### Client state, projections, tests

One `GET /api/view` returns the whole projection; catalog reads are separate and
deliberately bypass the store. **No optimistic update** — a command returns the
new projection and it is adopted wholesale. One command in flight at a time.
Conflict is re-read, never replayed.

The projection has 20 top-level keys with per-collection field allow-lists at
`domain/metyet-projection.js:109-206`, frozen as `FIELD_RULES` at `:496`. Two derived
fields ride on rows so the client never re-derives a rule: `status` and `grading`.
A TP receives **`binders: []` and `binderEntries: []`** — explicit empties.

**There is no design system.** No theme file, no component library, no CSS
framework, no build-time CSS. Styles are a template literal in a `<style>` tag per
shell — 281 lines for the Collector, 224 for the TP — `.mcs-` prefixed for
Collector and `.tps-` for TP, with **no shared tokens between seats**. `--ink` and `--accent` are referenced but
**never defined** — a live latent bug. **Neither brand font is loaded in
production**; the app renders in `system-ui`. No dark mode. **Exactly three media
queries exist**, all at 860px, and they do not agree: the Collector's two are
`min-width` (mobile-first), the TP's one is `max-width` (desktop-first). One
breakpoint, no tablet or wide-desktop tier.

**Tests pin the UI more than you would expect**, and a rebuild must plan for it:
tab **labels**, `SECTIONS`/`DEFERRED_SECTIONS` ids, element **types** for
interactive controls (`<button>`, `<select>`, `<input>`), the input id
`mcs-br-q`, about eight class names, the literal string
`const [browseSession, setBrowseSession] = useState(EMPTY_SESSION)`, and the
exposed-command list (7 exact-value pins + 4 count pins + a bidirectional pin
asserting *the set of commands `client/` sends equals the allow-list exactly*).
Markup nesting is largely free.

---

## C. Target mapping

Labels: **[R]** reusable now · **[P]** presentation change · **[A]** projection
adaptation · **[N]** new derived projection · **[E]** existing behaviour needing
production exposure · **[G]** genuine domain gap.

### Browse

| Target behaviour | Existing infrastructure | Label |
|---|---|---|
| Universal search box | `GET /api/card-contexts` + `CardBrowser.jsx` | **[P]** for the box; **[A]** to make one query hit name+set+artist |
| Art-led result grid, minimal metadata | `findCardContexts` returns a representative image per context; `CardArt` handles missing/broken | **[R]** data, **[P]** styling |
| "All Cards" lens | `findCardContexts` unfiltered | **[R]** |
| "Available from TPs" lens | raw data already in `/api/view` `state.inventory`; **no function produces a card-first lens** | **[N]** |
| Browse by generation | — | **[G]** no generation concept |
| Browse by Pokémon (tiles) | — | **[G]** no species concept; no number→name map |
| "All cards of this Pokémon" | `?pokedex=N` | **[R]** |
| Navigate card → more of this Pokémon / set | `describeCanonicalCards` omits `expansionId` and `pokedexNumbers` | **[A]** add two fields |
| Card detail | `readCardContext` returns context + active printings | **[R]** |

### Binders

| Target behaviour | Existing infrastructure | Label |
|---|---|---|
| Binder library, create/rename/archive | 5 exposed commands | **[R]** |
| A card in several Binders | join record, unique per (binder, card) | **[R]** |
| Enter a Binder for context | `Binder.jsx` | **[P]** |
| Cross-Binder: All Cards | `state.binderEntries` + `collectorCopies` | **[N]** client derivation |
| Cross-Binder: All Primary / All Secondary | `state.goals` + `tier` — **no function produces these lists today** | **[N]** |
| Cross-Binder: Trade/Sell | `collectorCopies` where `offered === true` (already the Your Cards filter) | **[R]** |
| Cross-Binder: PC | — | **[G]** or a product decision (§D) |
| Search the collector's own cards | — | **[N]** client-side over already-held state |
| Binder lifecycle Active/Completed/Pending | only `archivedAt` exists | **image-only, do not build** (§K) |

### Trusted Partners

| Target behaviour | Existing infrastructure | Label |
|---|---|---|
| Shop list with profile facts | `PARTNER_FOR_COLLECTOR` (name, city, about, specialties, contact) | **[R]** |
| "X has N cards you're looking for" | `discoveries` grouped by partner | **[R]** |
| Favourites / hearts | — | **image-only, forbidden by brief** |
| Transaction counts, star ratings | — | **image-only, forbidden by brief** |
| Nearby / Online filters | no geo concept | **image-only, forbidden by brief** |

### Deal Flow

| Target behaviour | Existing infrastructure | Label |
|---|---|---|
| Goal-grouped list of my matches | `discoveries` (pair-grouped; regroup by goal client-side) | **[R]** data, **[P]** surface |
| The specific qualifying copies under each Goal | `invIds` + `state.inventory` rows — **already in the browser, never rendered** | **[P]** |
| TP + copy facts (grade, cert, ask, photos) | `INVENTORY_FOR_COLLECTOR` | **[R]** |
| Matches are actually *exact* | criteria are inert | **[E-domain]** genuine extension (§K conflict) |
| Inspect | `reviewCopy` / `endReview` | **[E]** |
| Request Photos | `requestPhotos` | **[E]** |
| Agree Market Value | `startOpportunity` / `proposePrice` / `acceptPrice` | **[E]** + rename |
| Transaction lifecycle beyond that | the other 15 lifecycle commands, complete and tested | **[E]** |
| Losing a race leaves you able to act | goal stays locked by a dead deal | **[E-domain]** |
| For You / New / Ending Soon / Nearby | — | **image-only, forbidden by brief** |

---

## D. Card-selection data path

The path the brief describes already exists end to end, and it is already one
panel: `client/collector/CardSpecification.jsx` (658 lines), opened from Browse,
Your Cards and Binder.

```
canonical card (canonicalCardId, chosen from readCardContext's active printings)
   │
   ├─ Raw / Graded ──────────► goal.desired.grade   ∈ {Raw, PSA 1..PSA 10}
   │                            copy.grade          (same vocabulary)
   ├─ condition ─────────────► goal.desired.condition ∈ 5 values, REQUIRED iff Raw,
   │                            FORBIDDEN iff a PSA grade  (D.gradingProblem)
   ├─ print / language ──────► NOT criteria. These are identity dimensions folded
   │                            into canonicalCardId — a different print is a
   │                            different card, therefore a different Goal.
   │
   ├─ "Primary Goal"  ───────► Goal record, tier:"primary"      addGoal / updateGoalTier
   ├─ "Secondary Goal"───────► the SAME Goal record, tier:"secondary"
   ├─ "Trade-Sell"    ───────► CollectorCopy.offered = true     setCollectorCopyOffered
   └─ "PC"            ───────► (no fact)
   │
   ├─ Binder membership ─────► BinderEntry {binderId, canonicalCardId}
   └─ persistence ───────────► 11 pre-existing exposed commands, replayed as a DIFF
```

**Where simple UX spans several domain concepts — and must not be collapsed:**

1. **Primary / Secondary are one field, and that is correct.** They are two
   values of `goal.tier`, which is Goal *priority*. The brief agrees. "Not
   looking" is the *absence* of a Goal record, not a third enum value. The panel
   already models exactly this three-way (`WANTS = [none, secondary, primary]`).

2. **Trade-Sell is a different grain from the other three.** Goal priority is
   per **card**; `offered` is per **physical copy**. "I'd trade this card" has no
   representation for a card you own no recorded copy of. So the four-way choice
   in the image is not four values of one thing — it is *two card-level values
   plus a copy-level flag plus a gap*. A single-select control would be lying.

3. **PC has no fact.** The nearest is `offered === false` on a copy you have
   already recorded, which is an *absence of offering* rather than a positive
   statement of keeping, and is unstatable for a card you own no copy of. This
   is a product decision, not a bug — see §I and §K.

4. **The panel already refuses the collapse**, in writing:
   *"A four-valued 'intent' would have to pick one of those and would be wrong
   about a real person on their first day."* Both a prior hand-back and
   `domain/README.md` list "four-valued Intent" and "mutually exclusive Want/Own"
   as confirmed non-goals. **Do not reintroduce them for React convenience.**

5. `planFrom` computes a **pure diff** against the projection at Commit time and
   replays only what remains, which is what makes partial failure retryable.
   Any rebuild should keep that shape rather than inventing an aggregate
   `saveCardSpecification` command.

---

## E. Binder architecture

**All six surfaces are derived cross-Binder views. None is a Binder, and none
needs new persisted state.** Every input is already in the Collector's
projection.

| View | Derivation | Source |
|---|---|---|
| **All Cards** | union of `binderEntries.canonicalCardId` and `collectorCopies.canonicalCardId` and `goals.canonicalCardId`, de-duplicated | projection |
| **All Primary Goals** | `goals.filter(g => g.tier === "primary")` | projection |
| **All Secondary Goals** | `goals.filter(g => g.tier === "secondary")` | projection |
| **Trade/Sell** | `collectorCopies.filter(c => c.offered === true)` | already the Your Cards filter |
| **PC** | *no fact* — see §I | — |
| **Search** | client-side text match over the cards above, joined to names already fetched by `describe(ids)` | projection + existing catalog read |
| **A specific Binder** | `binderEntries.filter(e => e.binderId === id)` | projection |

**Why this works without fake Binders.** Binder membership names a canonical
card and nothing else; Goals and CollectorCopies carry no `binderId`. So every
"all X" question is a filter over a collection the Collector already holds
whole, and a Binder is just one more filter over the same universe. Adding a
persisted "Smart Binder" or a "Trade Binder" record would duplicate a truth that
is already derivable — and `tests/phase5-c34a-your-cards.cjs` already pins
*"no Trade Binder exists anywhere"*.

**Two cautions.**

- **Binder search must not become a second card-search engine.** It searches the
  Collector's *already-meaningful* cards — a few dozen to a few hundred rows
  already in memory — by name. The catalog search is a paged server query over
  the whole universe. They must stay separate paths with different affordances.
- **The read-path coupling is real and should be decided deliberately.** Since
  C3.4b, a Goal is only reachable through Binder (inside a binder that holds its
  card, or in the derived "Not in a binder yet" list). That is not a structural
  dependency — a Goal with no binder is perfectly valid and fully functional —
  but it means *discoverability* of Goals runs through Binder. The cross-Binder
  "All Primary / All Secondary" views above are exactly what fixes that, and are
  the reason they are worth building.

---

## F. Goal Match data path

Every arrow, with existence and exposure. `E`/`P`/`A` = exists / partial / absent.

| # | Arrow | Function | State | Exposed |
|---|---|---|---|---|
| 1 | Goal → acquisition criteria | `goal.desired` `{grade, condition}` | **E** — validated, required on the canonical path | `addGoal`, `updateGoalCriteria` ✅ |
| 2 | criteria → the match | — | **A — absent. `discoveriesIn` never reads `desired`.** | n/a |
| 3 | Goal → accepted TP relationship | `accepted()` `metyet-discovery.js:112` | **E** | relationship creation ❌ (`inviteCollector`); acceptance is a server route |
| 4 | relationship → TP physical inventory | `projectForCollector` `:336-347` + `INVENTORY_FOR_COLLECTOR` | **E** | rides `/api/view` ✅ |
| 5 | inventory → availability | `inventoryCopyStatus` / `copyForViewer` | **E** | derived ✅; the one *decided* input `setCopyPending` ❌ |
| 6 | availability → exact match | `discoveriesIn` `:140-185` | **E** (identity only) | rides `/api/view` ✅ |
| 7 | match → Deal Flow Goal grouping | grouped by **(goal, partner) pair** | **P** — regroup by goal client-side | ✅ |
| 8 | grouping → the specific copy | `invIds[]` + `state.inventory` rows | **E — already in the browser, never rendered** | ✅ |
| 9 | copy → Inspect | `reviewCopy` / `endReview` | **E** | ❌ |
| 10 | copy → Request Photos | `requestPhotos` | **E** | ❌ |
| 11 | copy → Agree Market Value | `startOpportunity` → `proposePrice` → `acceptPrice` → `agreedPrice` | **E** | ❌ |
| 12 | → the rest of the lifecycle | the other 15 lifecycle commands, `nextActor` authoritative | **E** | ❌ (all 18) |

**Arrow 2 is the only absent link, and arrows 9–12 are the exposure wall.**
Everything in between is built, tested and already on the wire.

**Gates on `startOpportunity`** worth knowing, because they shape the UI: seat
must be collector; the Goal must be owned and **Primary** (`goalIsPursued`); one
negotiation per Goal at a time; copy must exist, match on canonical id, belong to
a related partner, not be archived, and be **`available`**; amount > 0.

**Inspect and Request Photos create no Opportunity.** `startOpportunity` is the
only thing in the entire domain that creates one — deliberately, because writing
one at discovery time would lock the Goal at Primary, make it unremovable and
commit the copy.

---

## G. Pending integration

```
TP live Opportunity
   └─► Mark Pending ─────────► NO UI EXISTS. setCopyPending is not exposed,
                               and no production Opportunity could exist to name.
   └─► confirmation ─────────► DOES NOT EXIST for Pending. (Confirmation as a
                               concept does exist — confirmGoal,
                               confirmFulfillmentPlan, confirmHandoff — but
                               nothing confirms a Pending mark. `notify` and
                               `acknowledge` have zero hits repo-wide.)
   └─► setCopyPending ───────► EXISTS, 13 ordered gates, well tested
   └─► new entrants blocked ─► WORKS. startOpportunity refuses.
   └─► existing history ─────► PRESERVED as records, INVISIBLE as surfaces (below)
   └─► associated Collector ─► CONTINUES correctly per stage/turn
   └─► release ──────────────► WORKS, asked first, even on archived/sold copies
   └─► Final Agreement ──────► INDEPENDENT hard exclusivity at acceptDeal
   └─► Sold ─────────────────► history preserved, economic progression blocked
```

### The participant-aware gap, traced

Your brief's rule is exactly right and exactly absent: *"Pending closes the door;
it does not throw out people already in the room."* Today it closes the door **and
removes the room from view**. Three cases, probed:

| Pre-existing participant | Record | What they see |
|---|---|---|
| **Open review** | survives, `endedAt: null` | the copy row **vanishes** from their projection; `reviewCopy` still *succeeds*, so the domain and the projection disagree |
| **Open photo request** | survives; partner can still fulfil it; stamped `fulfilledAt` | the copy row is `null`, so **they cannot see the photograph they asked for** |
| **Live Opportunity** | stays `agree-price`, `declined: false` | every economic command refuses `copy-unavailable`; **and the Goal is locked** (§A finding 2) |

The mechanism is `copyForViewer` (`metyet-projection.js:243-248`): a copy held by
someone else's deal returns `null` for a viewer whose own opportunities do not
name it. That is *correct for privacy* and *wrong for a participant* — the two
requirements were never separated.

### The smallest coherent continuation rule

Recommended, not implemented:

1. **A pre-existing participant keeps the row.** Widen the "does the viewer have
   standing?" test in `copyForViewer` from *"an opportunity names this copy"* to
   *"an opportunity, an open review, or an open photo request names this copy"* —
   rendering `unavailable`, which is the flat public word and discloses nothing.
   This alone fixes the orphaned review and the swallowed photograph.
2. **A dead deal stops locking the Goal.** `activeOppForGoal` keys on
   `isNegotiating` (active && stage ≥ `agree-price`). An opportunity whose copy is
   committed elsewhere or sold can no longer proceed, so it should not count —
   derived, **no new state, no sweep**, exactly the pattern Option B used for
   stale `pendingFor`. The record stays as history; only the *lock* releases.
3. **Confirmation is UI, not domain.** `Cancel | Mark Pending` with the four
   explanations your brief lists is a dialog over an existing idempotent command.
   The viewer-authorized "which Collector/Opportunity" is already available to
   the owner: the TP's own inventory row carries `status` **and `pendingFor`**.

**Note the asymmetry that is already correct and must survive:** the owning
partner receives the precise refusal (`copy-pending` / `copy-committed`),
everyone else receives the flat `copy-unavailable`. Do not flatten it for the
owner; do not sharpen it for anyone else.

---

## H. Visual / component mapping

The reference is a strong fit for the existing component boundaries. Most of the
work is styling, not restructuring.

| Reference surface | Existing boundary | Work |
|---|---|---|
| Bottom tab bar (5 tabs) | `.mcs-nav` in `CollectorShell.jsx` — **already** a fixed dark bottom bar under 860px and a left rail above | **[P]**, plus one new tab |
| Search field "Search Pokémon, sets, artists…" | `CardBrowser.jsx` (`id="mcs-br-q"`, load-bearing in 11 test assertions) | **[P]** + **[A]** for one-box semantics |
| "All Cards / Available from TPs" segmented control | `DOORWAYS` already models a lens row | **[P]** + **[N]** for the second lens |
| Generation tiles | — | **[G]** |
| Pokémon tiles (Bulbasaur #001 …) | — | **[G]** |
| Card result grid | `.mcs-br` grid, `auto-fill minmax(120px,1fr)` → 2-up at 375px | **[P]** |
| Card art with graceful fallback | `client/card-art.jsx` — already exactly right | **[R]** |
| Card detail + printing chooser | `readCardContext` + `CardSpecification` | **[R]** data, **[P]** |
| Card specification sheet | `CardSpecification.jsx` — already a bottom sheet under 860px, side panel above | **[R]** structure, **[P]** |
| Deal Flow tab itself | — | **[P]** new section; touches the shell's section/label pins |
| Binder list with progress | `Binder.jsx` | **[P]**; the coloured counts need a defined meaning (§K) |
| Binder filter row | — | **[N]** derived views (§E) — **not** the image's Active/Completed/Pending |
| Trusted Partner list | `TrustedPartners.jsx` | **[P]** only; ignore ratings/favourites/geo |
| Goal-grouped Deal Flow | — (data exists) | **[P]** new section, no new commands |
| Physical-copy match row | `state.inventory` + `present.js` `gradeLine`/`cardMarks`/`photoNote` | **[P]** |
| Inspect / Request Photos / Market Value actions | commands exist | **[E]** |
| TP Pending confirmation | `setCopyPending` exists | **[E]** + **[P]** dialog |

**Reusable surfaces to favour**, rather than new ones: `CardBrowser` (already
shared by both seats via a `prefix` prop), `CardArt`, `parts.jsx`
(`Panel/Record/Fact/Tag`), and `present.js` — which already holds
`cardTitle`, `gradeLine`, `statusLabel`, `holdingLine`, `stageLabel` and decides
nothing.

**Real visual work the image implies that does not exist:**

- **A shared token set.** Two seats, two unrelated stylesheets, no shared
  palette, and `--ink`/`--accent` referenced but undefined. The image's
  green/white/black is a *third* palette (the current accent is teal `#0B5D66`).
- **Fonts.** Neither Public Sans nor Archivo is loaded in production — the app
  renders in `system-ui`. The image's typography is a deliberate look and needs
  the fonts actually shipped.
- **Tablet and desktop tiers.** One 860px breakpoint exists, and `.mcs-panel`
  caps at 760px. The brief asks for coherence at four widths without "merely
  stretching mobile cards" — that is a genuine layout tier to design, not a
  media query to add.

---

## I. Gap classification

**1. Visual / presentation only**
Browse grid and card tiles; card detail; Binder screens; Your Cards; Trusted
Partners; nav restyle; the whole palette/typography/spacing system; Deal Flow's
surface given existing data; the Pending confirmation dialog's copy and layout.

**2. Existing projection / view adaptation**
Add `expansionId` and `pokedexNumbers` to `describeCanonicalCards` so a card row
can link back into a browse doorway without a second round trip. Make one search
box hit name + set + artist (today three disjoint filters with three different
match semantics). Regroup `discoveries` by goal for the Deal Flow surface. Lift
per-section client state into the shell to stop losing it (and stop re-issuing
catalog reads) on every tab change.

**3. New derived projection**
A card-first "Available from TPs" lens (the raw data is already in `/api/view`;
no new server read is required). The five cross-Binder views and Binder search
(§E) — all client-side derivations over state already held.

**4. Existing domain behaviour requiring production exposure**
`reviewCopy`, `endReview`, `requestPhotos`, `startOpportunity`, `proposePrice`,
`acceptPrice`, `cancelOpportunity`, `setCopyPending` — and eventually the other
14 lifecycle commands. **Cost to be aware of:** each exposure change edits
`server/exposed-commands.js` plus **7 exact-value list pins and 12 count
assertions** (`eq(EXPOSED_COMMANDS.length, 18, …)`), and a bidirectional pin
asserting the set of commands `client/` sends equals the allow-list exactly.
Counted, not estimated.

**5. Existing domain behaviour extension**
(a) **Acquisition criteria become a filter** in `discoveriesIn` and at
`startOpportunity`. `desired` already exists, is validated and is required on the
canonical path — this changes what reads it, not what is stored. **No migration.**
(b) **A dead deal stops locking its Goal** — a derived predicate change, no new
state, no sweep.
(c) **Participant-aware visibility** — widen the standing test in `copyForViewer`
to include an open review or photo request. No new state.

**6. Genuine domain-model change — one only**
**Pokémon species and generation.** The target Browse tab is built on
generation → Pokémon → cards, and none of it exists: no species id, no
number→name map, no generation. `pokedex_numbers[]` on a card context is the only
handle, and it is explicitly a presentation column excluded from every key.

*Proving the architecture cannot represent it today:* a species is not a card,
not a printing and not a context — it is a new noun above the whole canonical
chain. Deriving it from `card_name` is unsound (`"Dark Charizard"`,
`"Charizard VMAX"`, `"Pikachu (Red Cheeks)"`), and deriving generation from a dex
number needs a range table nothing currently holds. The smallest honest shapes
are (i) a client-side dex-range constant plus a number→name table, which keeps it
out of the domain but hardcodes reference data, or (ii) a small catalog-side
species/generation table populated by the same import. **This is the one place
the brief's target genuinely exceeds the model**, and it should be its own batch
with its own decision.

*Not in category 6, despite appearances:* **PC**. The model can already express
"I own this and am not offering it" (`offered === false`). Whether that *is* PC,
or whether PC needs a positive per-card fact, is a **product decision**, not an
architectural limit. Deciding it "is" costs nothing; deciding it is a separate
positive statement is a new durable fact and should be justified by pilot
evidence first.

---

## J. Implementation sequence

Each batch: user outcome · human job · domain concepts · durable fact · derived
view · commands/projections · tests · gate · non-goals · pilot evidence.

### Batch 1 — The match becomes true, and you can see it ★ recommended

- **User outcome.** A Collector opens Deal Flow and sees, grouped by the Goals
  they set, the *specific* physical copies in their trusted network that
  actually satisfy what they asked for — grade, condition, cert, photographs,
  asking price, which shop.
- **Human job.** "Who I trust has the exact thing I already told MetYet I want?"
- **Domain concepts.** Goal, `desired`, accepted relationship, InventoryCopy,
  availability, Discovery. No new nouns.
- **Durable fact.** **None.** No migration, no new field, no new command.
- **Derived view.** `discoveries` filtered by criteria and regrouped by Goal;
  copy rows already in `state.inventory`.
- **Commands / projections.** `discoveriesIn` consults `desired`;
  `startOpportunity` applies the same predicate; a dead deal stops locking its
  Goal. **No exposure change** — so none of the 19 allow-list assertions move.
- **Tests.** Criteria filter (and the two suites currently pinning the opposite
  are re-pinned with the reason written in); a grade/condition matrix **including
  the partial and absent cases** (below); a Collector whose deal can no longer
  proceed can demote, delete and pursue elsewhere — **and one whose deal is
  merely live still cannot**, so the intended invariant is pinned as well as the
  exclusion; the Deal Flow surface renders the right copies and discloses nothing
  about rival deals. **Budget for the shell pins too:** a new section touches the
  `SECTIONS`/`DEFERRED_SECTIONS` id assertions and the tab-label list in
  `tests/phase4-collector-production-shell.cjs`. Batch 1 is *exposure*-pin-free,
  not pin-free.
- **Gate.** Targeted + Option B suite + full suite + prod build + smoke.
- **Non-goals.** No Inspect, no Photos, no Market Value, no exposure, no Pending
  UI, no species/generation, no visual system rewrite.
- **Pilot evidence.** Whether exact matching is *useful* — how often a real
  Collector's criteria exclude a real copy, and whether seeing specific copies
  changes behaviour. This is the cheapest possible test of the product's central
  claim.

### Batch 2 — Qualification: Inspect and Request Photos

- **Outcome.** Look properly at a specific copy, and ask for the photographs.
- **Domain.** `copyReviews`, `photoRequests`. **Durable fact:** none new.
- **Commands.** Expose `reviewCopy`, `endReview`, `requestPhotos` (+3 → 21).
- **Also required here:** participant-aware visibility (§G rule 1), because this
  is the batch that creates participants who can be orphaned.
- **Non-goals.** No Opportunity, no price, no Pending.
- **Evidence.** Do Collectors inspect before engaging? Do shops answer photo
  requests?

### Batch 3 — Agree Market Value + minimum TP Pending

- **Outcome.** Open a conversation about what a copy is worth, and settle it.
  A partner can voluntarily mark a copy Pending with a confirmation.
- **Commands.** Expose `startOpportunity`, `proposePrice`, `acceptPrice`,
  `cancelOpportunity`, `setCopyPending` (+5 → 26).
- **Prerequisite:** resolve the **"Agree Market Value" naming collision** (§B).
- **Non-goals.** No trade package, no final agreement, no fulfilment.
- **Evidence.** Do TPs voluntarily use Pending, and when?

### Batch 4 — Browse as the image shows it

- **Outcome.** One search box over name/set/artist; the "Available from TPs"
  lens; card → more of this Pokémon / more from this set.
- **Work.** [A] unified query + two projection fields; [N] the TP lens.
- **Non-goals.** Generation and species tiles (Batch 5).
- **Prerequisite:** **a populated catalog** (§K).

### Batch 5 — Species and generation

The one genuine domain change. Its own batch, its own decision, and only worth
doing once there is a catalog to browse.

### Batch 6 — Binder cross-views and the visual system

Five derived views + Binder search; shared tokens, fonts actually shipped,
tablet/desktop tiers.

### Batch 7 — The rest of the transaction lifecycle

Trade package, final agreement, fulfilment: 14 more commands, already built and
tested, needing surfaces.

### On the brief's proposed first batch

The brief asks whether Batch 1 should be *"Available matching TP copies →
Inspect → Request Photos → Agree Market Value + minimum TP Pending control"*, or
whether evidence proves a smaller prerequisite is needed. **The evidence proves a
smaller prerequisite.** Two reasons, both verified:

1. **"Matching" is not matching.** A `PSA 10` Goal matches a `PSA 1` copy. Ship
   the proposed batch as-is and the Deal Flow tab's promise is false on day one —
   and it would be *learned* false by the pilot, wasting the evidence.
2. **Losing a race leaves a permanent, unexplained lock — and this is a
   prerequisite, not a live defect.** Being precise, because the distinction
   matters: `startOpportunity` is unexposed, so no production Collector can
   enter the trap today, and Batch 1 changes no exposure, so none can after it
   either. It must be fixed *before* Batch 3 opens that door — which is exactly
   why it belongs in the batch before it, while it is cheap and testable in
   isolation.

   Batch 1's **first** justification carries no such caveat: `discoveries`
   rides `/api/view` today and `TrustedPartners.jsx:155` renders it, so the
   false-match promise is live in production right now.

The proposed batch also bundles three surfaces, five to eight exposures, a TP
dialog and a new tab into one reviewable step. Splitting the truth-fixes out
costs one extra batch and makes every later one safe.

---

## K. Conflicts, risks, questions

**Not silently resolved. These need your decision.**

### 1. Exact matching contradicts a settled prior decision — **decision needed**

Your brief: *"Inventory failing a required criterion is not a weaker match; it is
not a match."* Current behaviour is the opposite, deliberately, and two tests pin
it with failure messages that read `"desired criteria became a filter"` and
`"criteria filtered the overlap"`. Changing this is right by your brief and is a
reversal of an earlier settled choice. **Confirm the reversal** — and answer the
sub-question it raises:

> **(a) Is a Goal's grade an exact value or a floor?** A Collector wanting
> `PSA 9` — does a `PSA 10` copy match? Strict equality says no. "At least this
> grade" says yes. The vocabulary is ordered (`Raw, PSA 1…PSA 10`) so either is
> implementable. The same question applies to condition.
>
> **(b) What does a partial or absent `desired` match?** `addGoal` requires only
> that **one** of `grade`/`condition` be stated, and `updateGoalCriteria`
> *"refuses a NEW absence, it does not invalidate an old"* — so canonical Goals
> with only one criterion, and older ones with none, both exist. Once `desired`
> filters, each needs a defined answer: does an unstated criterion match
> everything, or nothing?
>
> **I have not assumed an answer to either.**

### 2. PC has no representation — **decision needed**

Either (a) PC *is* `offered === false` on an owned copy — costs nothing, but is
unstatable for a card you own no recorded copy of and is an absence rather than a
statement; or (b) PC is a new positive fact — a genuine new durable concept.
§I argues for (a) until pilot evidence justifies (b).

### 3. Trade-Sell is per-copy, the image implies per-card — **decision needed**

The image's four-way choice treats Trade-Sell as a sibling of Primary/Secondary
Goal, i.e. a card-level statement. `offered` is per physical copy. Presenting
them as one control would either lie or silently require a recorded copy.

### 4. The catalog is almost certainly empty — **the real blocker**

No catalog data is checked in anywhere; the sole write path is an operator CLI
(`catalog-import`); C9.1 concluded the production catalog was never populated and
that the constraint is **commercial** — written confirmation that importing and
storing the data is permitted. **Browse, the entire first tab of the target UX,
has nothing to show until this is resolved.** It also blocks Batches 4 and 5.
C9.1's recommendation (measure three signed-in URLs for `total: 0` before
committing) still stands and is cheap.

### 5. Image elements that contradict the brief's own rules

Listed so they are consciously dropped, not accidentally built: Binder
Active/Completed/Pending filters (Binders have only `archivedAt`, and the brief
asks for state-derived cross-views instead); TP star ratings, transaction counts,
favourites, Nearby/Online (reputation and geo — explicitly forbidden, and absent
from the model); Deal Flow's For You / New / Ending Soon / Nearby (a marketplace
feed — explicitly forbidden). Authority order puts the brief above the image; I
have followed it.

### 6. Binder progress dots have no defined meaning

The image shows coloured counts per Binder (e.g. 12 / 8 / 4). Nothing in the
model defines those three buckets. Owned / wanted / neither is derivable and
plausible — but it is an invention, and should be specified rather than guessed.

### 7. "Agree Market Value" collides with existing command names

`proposeMarketValue` / `acceptMarketValue` already exist and mean per-trade-card
valuation inside `value-trade`. The product concept maps to `acceptPrice` /
`agreedPrice`. One of the two must be renamed before this vocabulary reaches a
screen or a person.

### 8. Exposure changes are expensive by design

Each one touches the allow-list plus **7 exact-value pins, 12 count
assertions**, and a bidirectional pin requiring the commands `client/` sends to
equal the list exactly. Batch sequencing should minimise the number of times this is disturbed —
another argument for the Batch 1 above, which changes exposure not at all.

### 9. UI tests pin more than markup

Tab **labels**, section ids, interactive element **types**, the input id
`mcs-br-q`, ~8 class names, and one literal line of shell source. A visual
rebuild that renames a tab or replaces a `<select>` with a custom dropdown will
break suites. This is manageable and largely *desirable* — but it must be
budgeted rather than discovered.

### 10. Prototype semantics are a porting hazard

`partnersWith` and the demo's `identityKey` fold grade and condition **into
identity** and pick "one best copy per partner". They look like exactly the Deal
Flow logic you want and are semantically wrong under the canonical model. Do not
port prototype UI by reference.

### 11. Assets and responsiveness

Card artwork comes from third-party URLs stored unvalidated; the demo ships no
artwork at all; neither brand font is loaded in production; there is one
breakpoint and no tablet or wide-desktop tier; `--ink` and `--accent` are
undefined tokens in the live stylesheet.

### 12. A latent browse defect

`catalog-repository.js:311` — a **non-numeric** `pokedex` parameter silently
**drops the filter** and returns the entire unfiltered catalog while still
logging it as a Pokémon-doorway search. (A numeric one filters correctly; my
first reading said otherwise and was wrong.) The shipped client strips non-digits, so
it is unreachable today; a rebuilt search input that loosens that would re-open
it.

---

### 13. What an adversarial pass corrected in this document

Recorded because the corrections change what you would conclude, and because a
plan is only as good as the claims under it. An adversarial review was run over
the finished draft; every item below was then re-verified by my own probe.

| Claim as first written | What is actually true |
|---|---|
| "A losing deal traps the Goal — she cannot demote, delete or pursue elsewhere" | **Overstated.** Three of those four blocks fire with **no rival at all** — they are the intended one-negotiation-per-Goal invariant. Losing changes only that the lock becomes *permanent*. §A now says so. |
| "22 deal-lifecycle commands" | **18** (21 with the three qualification commands). `chooseCashOnly` was missing from the list entirely. |
| "~7 exact pins + ~4 count pins" | **7 exact-value pins + 12 count assertions.** The exposure cost is ~60% higher than quoted. |
| "Zero hits for confirm/acknowledge/notify anywhere in the repo" | **False** — `confirmGoal`, `confirmFulfillmentPlan`, `confirmHandoff` exist. Only `notify`/`acknowledge` are absent. The conclusion (no confirmation for *Pending*) survives. |
| "Losing a race is currently a trap" as a Batch 1 justification | **A prerequisite, not a live defect** — `startOpportunity` is unexposed, so nobody can enter the trap today. |
| "A numeric or non-numeric `pokedex` drops the filter" | **Non-numeric only.** A numeric value filters correctly. |
| "Batch 1 moves no pins" | **Exposure-pin-free, not pin-free** — a new tab touches the shell's section-id and label assertions. |
| "`desired` is required on the canonical path" | True, but only **one** of grade/condition is required, and older Goals may have neither — so making it a filter has a second open semantic (§K.1b). |
| "The catalog is empty" | **Inferred, not measured.** Nothing in the worktree can read a production database. Softened in §A. |
| Minor | 11 step kinds not 10; TP stylesheet 224 lines not ~280; the TP media query is `max-width` (desktop-first), so the three do not agree; `discoveriesIn` ends at `:183`; `FIELD_RULES` is at `:496`. |

Checked and confirmed correct: the 50/18 command counts; `discoveriesIn` never
reading `desired`; the PSA 10 → PSA 1 probe; the two tests pinning it; the photo
request stamped `fulfilledAt` against a null row; the orphaned review; no
species or generation anywhere; `--ink`/`--accent` undefined; neither font
loaded; Binder membership naming the canonical card; Goal identity independent
of Binder; PC and durable Pending Interest never having existed; every Deal Flow
field already reaching the Collector with `invIds` rendered nowhere in
`client/`; and that a read-only Deal Flow surface needs no new command and no
new route.

---

## L. Recommended next implementation batch

> ### The match becomes true, and you can see it.

**Scope.** Three things, together:

1. **Acquisition criteria filter the match.** `discoveriesIn` consults
   `goal.desired`; `startOpportunity` applies the same predicate. No migration,
   no new field, no new command.
2. **A dead deal stops locking its Goal.** An Opportunity whose copy is committed
   elsewhere or sold no longer counts as an active negotiation, so the Collector
   can demote, delete, or pursue that card at another shop. Derived — no new
   state, no sweep, the same pattern Option B used for stale `pendingFor`. The
   record survives as history.
3. **A read-only, Goal-grouped Deal Flow surface** showing the *specific*
   qualifying copies — shop, grade, condition, cert, photographs, ask. Every
   field is already in the Collector's browser and none of it is rendered today.

**Why this is the smallest coherent step.**

It is the smallest change that makes one true sentence true: *"Who I trust has
the exact thing I already told MetYet I want."* Today that sentence is false in
two independent ways — the match is not exact, and the data behind it is
invisible. Fixing either alone leaves the tab either lying or empty.

It **changes production exposure not at all**, so none of the 19 allow-list
assertions move and no new command reaches a browser. (It does touch the shell's
section and tab-label pins, because it adds a tab.) It adds **no durable fact and no
migration**. And it stops precisely at the boundary where the next thing
(Inspect) would require exposure — a clean seam.

**What it proves.**

Whether exact matching is *useful*: how often a real Collector's stated criteria
actually exclude a real copy, and whether seeing specific physical copies —
rather than "Northline has 2" — changes what people do. That is the central claim
of the product, and this is the cheapest possible test of it.

**What remains untouched.**

Inspect, Request Photos, Agree Market Value and the entire transaction lifecycle
stay unexposed. Pending stays unexposed and gets no UI. Species and generation are
not attempted. Browse, Binder, Your Cards and Trusted Partners keep their current
surfaces. The visual system — tokens, fonts, tablet and desktop tiers — is not
begun. `PC`, the Trade-Sell grain question, and the grade floor-vs-exact question
are decisions, not code, and §K asks for them.

**One dependency to settle first.** Item 1 reverses a pinned prior decision
(§K.1). It needs your confirmation, and the floor-vs-exact sub-question answered,
before it is implemented.

**Not implemented. Audit complete.**
