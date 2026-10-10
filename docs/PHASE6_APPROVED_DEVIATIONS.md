# Phase 6 — Approved Deviations Register

**Authority.** The frozen Phase 6 prototype (`phase6-prototype-01` @ `fca2c61`) is the default visual and interaction authority for the production Collector app. Production domain behaviour (commands, projections, permissions, persistence) is the behavioural authority. Any visible difference from the prototype is either **approved** (listed in A, with who approved it and when) or **unresolved** (listed in B, awaiting a founder decision). An implementation difference is never treated as approved because it exists.

**How to check.** `npm run review:fidelity` renders both at 390 × 844 with the same Collector data and writes side-by-sides and measurements to `artifacts/fidelity/` (gitignored).

---

## A. Approved deviations

| # | Deviation | Why | Approved |
|---|---|---|---|
| A1 | Four Collector tabs — Browse, Binders, Deal Flow, Trusted Partners (prototype: Browse, Binders) | Production has Deal Flow and Trusted Partners | Founder, P6-1 brief; reaffirmed P6-F1 |
| A2 | Goals and owned copies are distinct domain objects; the card never converts one into the other | Domain rule; no atomic conversion command exists | Founder, P6-4 brief; reaffirmed P6-F1 |
| A3 | Binder membership is independent of Goal priority and ownership | Domain rule | Founder, P6-4 brief; reaffirmed P6-F1 |
| A4 | Binders are put away (reversible archive); no permanent delete (prototype: Delete) | No delete command; archive is reversible | Founder, P6-2/P6-3.1 briefs; reaffirmed P6-F1 |
| A5 | No external card-image provider; only approved catalogue images. Until rights are resolved, cards show the prototype's own drawn placeholder | Image rights unresolved | Founder, Batch 1 / P6-F1 |
| A6 | Undo after filing | Founder request | Founder, P6-3 brief; reaffirmed P6-F1 |
| A7 | No Goal-free offers | Domain rule; separate future decision | Founder, Batch 1; reaffirmed P6-F1 |
| A8 | Existing permissions and authorization unchanged | Production authority | Founder, every brief |
| A9 | A binder opens in place, with no separate "Open …" screen (prototype: "Open Mudkip — add cards, rename, delete ›") | Founder: no two navigation steps for one binder | Founder, P6-3.1 brief |
| A10 | **Interim:** Set and Artist rows show a fan of three *drawn* placeholder cards (prototype: three real card faces) | No approved artwork | Founder, P6-F2 D4 (provisional — not a permanent design decision) |
| A11 | **Interim:** Artists are listed alphabetically (prototype: the artists with the most cards first) | Production's artist list | Founder, P6-F2 D4 (provisional) |
| A12 | Browse's Pokédex, card-number search and in-set numeric order come from three read-only catalogue capabilities (`GET /api/pokemon`; `number=` and numeric-aware ordering on `/api/card-contexts`) | The prototype computed them from a bundled dataset production must not have | Founder, P6-F2 D1–D3 |
| A13 | **Review-only artwork exception (local review, one card).** The local review world (`harness/phase6-world.cjs`, in-memory) and the fidelity harness put the prototype's own picture of **Mudkip — Ruby & Sapphire #60** into that card's existing catalogue image fields. Nothing that ships names a provider; a test fails if one does (`tests/phase6-f3a-card-detail.cjs` F). No rights are assumed | Visual fidelity cannot be judged on placeholders | Founder, P6-F3A Stage 1 (Option B) |
| A14 | **Card question order:** Which version? → Raw or graded? → condition or grade → What does this card mean to you? → Primary / Secondary or Personal collection / Trade / Sell → Add (prototype: meaning first, then the physical card). The collecting state is always the last decision. Version names say the print run when two versions differ by it ("Holo · Unlimited" / "Holo · First Edition") | The Collector identifies the card, then describes it, then says what it means | Founder, P6-F3A Stage 2.1 |
| A15 | **Collecting-state visual language:** Primary green #21865A, square focus reticle, "Actively hunting"; Secondary blue #3C75CA, eye, "Interested"; PC purple #8655B9, gem, "A keeper"; Trade / Sell orange #CB792E, exchange arrows, "Available for trade or sale" — one mapping (`client/collector/states.jsx`) on Binder tiles, the card sheet, Browse markers and the Phase 6 card's choices. Labels use a darker ink of the same hue (≥4.6:1 on their tint); the founder colour marks the icon and outline. Secondary on the card: "I'm interested in this card." | The prototype had no state colours or icons | Founder, P6-F4 B2A |

## B. Unresolved — awaiting founder decision

| # | Difference | Current production behaviour | Introduced | Notes |
|---|---|---|---|---|
| B1 | Account controls on a phone | No account bar; a 44 px initial button in the screen header opens an account sheet (name, role, what works today, Sign out). Desktop keeps the top bar | P6-F1 | The prototype had no account controls at all; sign-out must stay reachable |
| B2 | Release-limitation notice on a phone | No banner. The full notice is in the account sheet; Deal Flow and Trusted Partners show one line ("Trades and messages arrive later." + "What works today"); a fully read-only shell says "Read-only for now…" on every screen. Desktop keeps the banner | P6-F1 | Wording unchanged, only placement. Confirm that Binders and Browse need no line when Goals can be changed |
| B3 | Search text size | 16 px (prototype 13.5 px) | P6-2 | iPhone Safari zooms the page when a focused field's text is under 16 px |
| B4 | Screen subtitles | Hidden on Browse and Binders on a phone (as in the prototype); kept on Deal Flow and Trusted Partners, which the prototype did not design | P6-F1 | |
| B5 | Tab label size | 13 px, each tab as wide as its label (prototype: 14 px, two equal tabs) | P6-F1 | Needed for four labels on one line at 390 px |
| B6 | Card detail is a bottom sheet with a 96 px picture (prototype: full-screen page, ‹ Back, picture at 72 % width, ✎ grade editor) | — | P6-4 | **Scheduled for P6-F2** |
| B7 | Four states shown as two labelled pairs with the other pair muted (prototype: one 2 × 2 grid) | — | P6-4 | Domain rule A2 is approved; its **presentation** is P6-F2 |
| B8 | ~~Tile caption: name first~~ | **Resolved in P6-F4 B1** — the prototype's order: state, then (in Your Cards) home, then the card (name #number · version in a collector's words · its own grade). The set is on the card sheet, as in the prototype | — | Awaiting founder visual acceptance |
| B9 | ~~Expanded binder: cards on the page under the row~~ | **Resolved in P6-F4 B1** — one bordered cover holds the row and its cards. On a phone, cards inside a cover are its inset narrower than cards on the page (107 vs 114 px at 390), as in the prototype: founder decision 2026-10-10, over P6-3.1's one size everywhere (still one size from tablet up) | — | Awaiting founder visual acceptance |
| B10 | ~~Filing confirmation: dark bar~~ | **Resolved in P6-F4 B1** — the prototype's quiet teal note, with production's Undo (A6) inside it; after a confirmed filing the destination binder opens (never for a refusal, Unfiled or Undo). Wording stays production's ("Charizard is filed in Mudkips."; prototype: "Mudkip #18 → Mudkip.") | — | Awaiting founder visual acceptance |
| B11 | ~~Filing chooser has no "+ New binder" destination~~ | **Resolved in P6-F4 B2A** — + New binder in both the Move chooser and press-and-hold: createBinder, then fileObject into the binder it returned; a refused or lost move keeps the binder and offers Try moving again (never a second create); a lost answer to createBinder is looked up before anything is resent | — | Awaiting founder visual acceptance |
| B12 | ~~Browse is production's form-based Browse~~ | **Resolved in P6-F2** — the Phase 6 discovery screen | — | See B15–B19 for what remains |
| B13 | Desktop layout (sidebar, side-panel sheet) | — | P6-1 | The prototype specified only a phone |
| B14 | Fonts | Archivo / Public Sans named but not loaded, so the system face renders (as in the prototype) | P6-1 | Loading web fonts adds an external host |
| B15 | Search breadth | The grid searches card **names and numbers**; set and artist names are reached through their **suggestions** (prototype: one search matched names, numbers, set and artist names at once). When only a suggestion matches, the empty grid points to it | P6-F2 | A combined search would need another catalogue change |
| B16 | Suggestion counts | The catalogue's own totals, not narrowed to the chips already chosen (prototype: counts within what is on screen) | P6-F2 | Would need counts per constraint from the server |
| B17 | Card order **across** sets | By set code (D3 left cross-set order unchanged); prototype: older sets first | P6-F2 | A one-line ordering change; awaits a decision |
| B18 | Placeholder foot shows the card's number, not "number/set total" | Card rows do not carry the set's printed total | P6-F2 | Cosmetic; one more field on the card reply |
| B19 | "Not recordable yet" is not marked on grid cards (prototype marks cards with no printing MetYet can record) | Production says so when the card is opened | P6-F2 | Needs a printing count on the card reply |
| B20 | ~~Card selected from Browse opens the production version picker and Card Specification sheet~~ | **Stage 1 of P6-F3A:** Browse opens the Phase 6 full-screen card (‹ context, ‹ › through the results, 72 % hero, identity, MetYet remembers, Which version?, pinned Add). Binders still opens its own sheet (B6) | — | Awaiting founder approval of Stage 1 |
| B21 | ~~**Stage 1 interim:** the card's guided questions are not drawn; Add opens the existing Card Specification~~ | **Resolved in Stage 2:** the prototype's questions, ending in one `addGoal` or `addCollectorCopy` | — | Awaiting founder approval of Stage 2 |
| B22 | Card identity says "60", not "60/109" | Card replies carry no set printed total (as B18) | P6-F3A S1 | One more field on the card reply |
| B23 | Without the Stage 2 questions, a card page is short, so on a 390 × 844 phone it does not scroll far enough (300 px, the prototype's rule) for the header to carry the card. The behaviour is present and proven on a 390 × 460 window | — | P6-F3A S1 | Resolves itself with Stage 2 |
| B24 | **Venusaur — card-level artwork.** The prototype attaches a picture to the CARD; production stores pictures only on a recordable printing (`canonical_cards.image_*`), so a card whose only printings are not recordable has no picture | — | P6-F3A S1 | **Catalogue decision, not solved here.** Where a card-level picture would live, and under what rights |
| B25 | **Venusaur — unavailable printings.** The prototype lists printings MetYet cannot record yet (dashed, "Not available in MetYet yet", e.g. Venusaur's quarantined Holo and 1st Edition stamp). Production has no read of a card's quarantined source mappings, so they are not shown; a card with none recordable says "MetYet can't record this card yet." | — | P6-F3A S1 | **Catalogue decision, not solved here.** Needs a per-card read of unrecorded printings |
| B26 | Previous / next order across sets follows B17 (set code), so Mudkip #60's neighbour differs from the prototype's | — | P6-F3A S1 | Follows B17 |
| B27 | **Arriving from a binder's "+ Add cards".** In that mode only, the card shows no questions and Add opens the existing Card Specification with that binder ticked — a temporary compatibility path; cards entered from a binder are never added unfiled | — | P6-F3A S2 | **Founder (Stage 2.1): resolve during the Binders milestone** |
| B28 | "Add to MetYet wakes up as you answer." shows until the Collector's first Add in a session (prototype: hidden for its "Returning Collector" preset, which has a stored preference production does not) | — | P6-F3A S2 | Would need a remembered per-Collector preference |
| B29 | Changing a Goal's tier or criteria is not offered on the Browse card: an existing Goal shows as "You're looking for it" (as in the prototype). The Card Specification allowed it from Browse; it remains available in Binders | — | P6-F3A S2 | Prototype behaviour; noted because Browse used to allow it |
| B30 | A refused or failed Add is said on the card in production's own words (e.g. "Nothing was saved: the goal could not be saved — That card is already on your list.") and the answers stay. The prototype had no refusal state (it alerted a defect), so there is no visual reference | — | P6-F3A S2 | |
| B31 | Text smoothing: production renders antialiased app-wide (the prototype does not), so text looks slightly lighter in comparisons | — | P6-1 | Shell-wide; not changed in this batch |
| B32 | "Keeping an eye out" is still the Secondary wording in the Card Specification, the Collection list view and `present.js` (shared Deal Flow / Trusted Partners text); the new language ("Interested") is on Binder tiles, the card sheet, Browse and the Phase 6 card | — | P6-F4 B2A | Those surfaces are scheduled for replacement; changing shared wording was out of this batch's scope |
| B33 | The card sheet's binder controls are one **Move** (its chooser holds every binder, Unfiled and + New binder) — the separate "Take out of …" button is gone; Unfiled is a destination | — | P6-F4 B2A | Founder brief: one obvious Move |

## C. Unavoidable comparison differences (not product decisions)

- The prototype's screen is 370 × 800 inside its drawn bezel; production's is 390 × 844. Tiles are wider by that ratio.
- Placeholder colours derive from each app's own card ids, so the same card is a different hue in each.
- The prototype's provider artwork has no production equivalent (A5); the harness also captures the prototype with its card images blocked, which is the like-for-like. For Mudkip R&S #60 only, both sides show the same picture (A13).
- The two worlds' catalogues differ in which other Mudkip cards exist, so the cards beside #60 differ (and see B26).
