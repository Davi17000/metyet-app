# P6-F2 — Browse Fidelity Audit (pre-implementation)

**Compared:** frozen prototype `fca2c61` (`prototypes/phase6-01-browse-add/main.jsx` `BrowseView` L186–339, `CardDetail` L432–611; `fixtures.js` L128–144; `index.html`) against production `3447331` (`client/collector/sections/Browse.jsx`, `client/browse/CardBrowser.jsx`, `client/collector/CardSpecification.jsx`, `server/app.js` L358–415, `persistence/catalog-repository.js` L255–402). Both rendered at 390 × 844 (emulated iPhone, 3×, touch). Requirements: *Collector Browser PRD (revised 28 Sep 2026)*.

**Verdict.** Production Browse is a form inside a panel; the prototype is an image-first discovery surface. Most of the prototype can be rebuilt on today's catalogue API — **except its landing screen**, the visual Pokédex, which needs one read-only catalogue endpoint that does not exist. The prototype's card detail is a full-screen page that is the shared card experience for P6-F3. Details below; decisions in §4.

---

## 1. Area-by-area

| # | Area | Prototype | Production today | Gap / feasibility on today's API |
|---|---|---|---|---|
| 1 | **Landing** | "Browse" title; one search field *"Search Pokémon, sets, artists or cards"*; pill tabs **Pokémon · Sets · Artists**; Pokémon tab open | A `Panel` titled BROWSE; doorway pills Pokémon · Set · Artist; a **form**: "Pokémon or card name" + "Pokédex number"; "Type a Pokémon… to start looking." | Layout, search field and tabs: **rebuildable**. The content of the default tab is the Pokédex (#2) |
| 2 | **Pokémon entry** | A **Pokédex**: Generation chips (All, Gen 1–9, from National Pokédex ranges) over a 2-column grid of species tiles — card art, species name, *N cards*. Derived from the catalogue (distinct Pokédex numbers; plainest card name; most recent card with a picture) | Two text fields; nothing to look at until something is typed | **Blocked.** No endpoint lists species. `card_contexts.pokedex_numbers` holds the data; a list needs a new read (§4, decision D1). Downloading the catalogue to derive it client-side is ruled out |
| 3 | **Set entry** | Rows: a fan of 3 card faces, set name, year · series · *N cards*; newest first; tap → set becomes a constraint | A chooser of the **first 100** sets only (PRD defect: older sets hidden) | **Rebuildable:** `/api/expansions` is searchable, paged, newest first, with series, release date, card count — page through all. **Fan:** no sample cards per set in that reply (D4) |
| 4 | **Artist entry** | Rows: fan of 3, name, *N cards*; the artists with the most cards | A chooser of the **first 100** artists (alphabetical) | **Rebuildable** with paging (`/api/artists` searchable, paged, counts). Prototype ranks by card count; production orders alphabetically (D4). Fan: as #3 |
| 5 | **Search & filtering** | One field over everything (Pokémon, card number, artist, set). Suggestions that **narrow what is on screen**, with counts. Pokémon / Set / Artist are **chips that compose in any order** (intersection); "Clear all" | Card-name substring only; Pokédex number as a second field; one doorway at a time | **Partly rebuildable:** `/api/card-contexts` already ANDs `query`, `expansionId`, `artist`, `pokedex` → chips compose. Set and artist suggestions from their searches (global counts, not "within what is on screen"). **Not possible today:** Pokémon suggestions (needs D1), card-number search, counts within the current constraints (D2) |
| 6 | **Results grid** | 2 columns; card art; caption *set · #number*; the Collector's own markers (Primary / Secondary / PC ×n / Trade / Sell); "Not recordable yet"; infinite scroll in chunks of 60; *N cards* in the header | 24 per page with page buttons; name + set · #; "on your list / you own one" only inside the version picker | **Rebuildable:** grid, captions, infinite scroll (paged requests), header count, "not recordable" (context with no printings). Markers: `describeCanonicalCards` returns each card's context id, so the Collector's own Goals/copies can be marked. **Order:** production sorts by set code, then card number **as text** ("1, 10, 100, 11") — prototype is numeric/release order (D3) |
| 7 | **Artwork & placeholders** | Provider artwork everywhere (not approved for production); its own drawn placeholder when missing | Catalogue `imageSmall` where an approved import stored one, else the card's name | **No approved artwork exists** → every tile is the P6-F1 drawn placeholder. Disclosed, not hidden (A5) |
| 8 | **Card selection** | Tap a card → full-screen **CardDetail** | Tap → "Which one?" version picker sheet → **Card Specification** panel (the shared production card experience; also Binders' "Open full card") | The detail is the shared card experience → **P6-F3** (brief §5). F2 keeps the production destination |
| 9 | **Card detail & navigation** | "‹ *your browse context*" back label; **‹ › previous / next** through the results; hero art 72 %; set · number/total · artist; "MetYet remembers"; version choice; guided "looking for it / I own it" questions; "Add to MetYet"; acknowledgement, then back to the grid | Bottom sheet; no previous/next; Commit button | Previous/next and the back label live **inside the detail** → P6-F3. **Discovery pivots** (Pokémon / Set / Artist links on the card) are a **PRD requirement the prototype does not have** (D5) |
| 10 | **Paths to Goals, copies, Binders** | Goal (tier + wanted grade) or owned copy (PC / Trade, raw/graded) from the card; **no Binder step** in Browse ("a separate job, done in Binders") | Card Specification composes Binder ticks + Goal + copies, one Commit | Same durable facts through the same commands; F2 changes none of it. The prototype's "no binder in Browse" vs production's binder ticks is a P6-F3 question |
| 11 | **Empty / loading / error** | "Nothing matches “…” in *context*." | "Looking…", "Nothing matches that yet…", "could not be reached" | Rebuildable; production's honest error wording kept |
| 12 | **Back & context** | Constraints, text, scroll and loaded count kept per context; back label names the context | The grid never unmounts, so the doorway, results and scroll are kept | Rebuildable on production's session model (it already survives a trip to another tab) |

## 2. Prototype → production mapping (if implemented)

| Prototype | Production |
|---|---|
| `BrowseView` | new Collector-only Browse body in `sections/Browse.jsx`. **`CardBrowser.jsx` stays as is** — it is shared with the Trusted Partner's Inventory, which this milestone does not change |
| `.narrow.unified`, `.chips`, `.suggestions`, `.tabs`, `.filters.gens`, `.tiles`, `.rows`/`.fan`, `.grid`/`.cell`/`.cap`, `Markers` | ported styles in the P6-F1 phone layer of `CollectorShell.jsx`, values from `index.html` |
| `CardArt` (provider image or drawn card) | `client/card-art.jsx` with `card` (P6-F1 placeholder) |
| client-side `CONTEXTS`, `POKEMON`, `SETS`, `ARTISTS` | `/api/card-contexts`, *(D1)*, `/api/expansions`, `/api/artists` — server-paged |
| `CardDetail` | `CardSpecification` (unchanged in F2) → P6-F3 |

## 3. Already wrong in production (independent of the decisions)
- Set and artist choosers stop at 100 entries (PRD §12 defect).
- Card numbers sort as text within a set.
- P6-F1 defect: on screens with no count (Browse, Deal Flow), the account button sits beside the title instead of at the right edge.

## 4. Decisions needed before implementation

| | Decision | Smallest safe option | Impact if declined |
|---|---|---|---|
| **D1** | **A Pokémon list for the Pokédex** | One authenticated, read-only endpoint, e.g. `GET /api/pokemon?query=&page=&pageSize=`, derived from existing `card_contexts.pokedex_numbers` exactly as the prototype derives it: one row per Pokédex number, label = plainest card name, card count, one representative context. No migration, no new data, no write. Generation from the fixed National Pokédex ranges, client-side, as in the prototype | The Pokémon tab — Browse's landing — cannot be a Pokédex. The nearest honest fallback is a search-first Pokémon tab, which is not the approved landing |
| **D2** | **Unified search breadth** | Add an exact card-number filter to `/api/card-contexts` (`number=`). Suggestion counts stay global (labelled "N cards"), not "within what's on screen" | Card numbers cannot be searched; suggestion counts may over-promise when combined with an active constraint |
| **D3** | **Result order** | Numeric-aware ordering inside a set (number's leading digits, then the text), set order by release date | Numbers read 1, 10, 100, 11… |
| **D4** | **Set / artist rows: fans and ranking** | Fans: drawn placeholders only (no sample-card query) until artwork is approved; artists alphabetical (production) rather than "most cards" (prototype) | Rows look plainer than the prototype; flagged as deviations |
| **D5** | **Discovery pivots** | PRD requires Pokémon / Set / Artist pivots from a card; the prototype has none in its card detail (its chips compose instead). Decide whether pivots belong in the P6-F3 card detail | — |
| **D6** | **Card detail** | Confirm P6-F3 replaces the shared Card Specification with the prototype's full-screen detail (previous/next, back label, hero, guided questions) for **both** Browse and Binders | Browse's card transition stays the production sheet |

**Artwork** (A5): no approved source; every card is a drawn placeholder. The image-first experience will be placeholder-first until rights are resolved.

## 5. Evidence
Screens at 390 × 844 (prototype "Returning Collector"; production review seed): landing, Gen 3, Pokémon results, card detail, back, Sets, set results, Artists, search suggestions, empty — `scratchpad/f2/shots/{proto,prod}-*.png` (local review artefacts, not committed).
