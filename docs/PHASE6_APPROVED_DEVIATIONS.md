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
| B8 | Tile caption: name first (prototype: state, then home, then identity) | — | P6-3.1 brief | **Scheduled for P6-F2** |
| B9 | Expanded binder: cards on the page under the row (prototype: inside the bordered binder cover) | — | P6-3.1 brief | **Scheduled for P6-F2** |
| B10 | Filing confirmation: dark bar (prototype: light teal note) | — | P6-4 | **Scheduled for P6-F2** |
| B11 | Filing chooser has no "+ New binder" destination | — | P6-3 | Would need two commands that can half-succeed |
| B12 | ~~Browse is production's form-based Browse~~ | **Resolved in P6-F2** — the Phase 6 discovery screen | — | See B15–B19 for what remains |
| B13 | Desktop layout (sidebar, side-panel sheet) | — | P6-1 | The prototype specified only a phone |
| B14 | Fonts | Archivo / Public Sans named but not loaded, so the system face renders (as in the prototype) | P6-1 | Loading web fonts adds an external host |
| B15 | Search breadth | The grid searches card **names and numbers**; set and artist names are reached through their **suggestions** (prototype: one search matched names, numbers, set and artist names at once). When only a suggestion matches, the empty grid points to it | P6-F2 | A combined search would need another catalogue change |
| B16 | Suggestion counts | The catalogue's own totals, not narrowed to the chips already chosen (prototype: counts within what is on screen) | P6-F2 | Would need counts per constraint from the server |
| B17 | Card order **across** sets | By set code (D3 left cross-set order unchanged); prototype: older sets first | P6-F2 | A one-line ordering change; awaits a decision |
| B18 | Placeholder foot shows the card's number, not "number/set total" | Card rows do not carry the set's printed total | P6-F2 | Cosmetic; one more field on the card reply |
| B19 | "Not recordable yet" is not marked on grid cards (prototype marks cards with no printing MetYet can record) | Production says so when the card is opened | P6-F2 | Needs a printing count on the card reply |
| B20 | Card selected from Browse opens the production version picker and Card Specification sheet (prototype: full-screen card with ‹ context, previous / next, guided questions) | — | P6-F2 | **P6-F3** (founder D5/D6): one shared full-screen card for Browse and Binders, with Pokémon / Set / Artist pivots |

## C. Unavoidable comparison differences (not product decisions)

- The prototype's screen is 370 × 800 inside its drawn bezel; production's is 390 × 844. Tiles are wider by that ratio.
- Placeholder colours derive from each app's own card ids, so the same card is a different hue in each.
- The prototype's provider artwork has no production equivalent (A5); the harness also captures the prototype with its card images blocked, which is the like-for-like.
