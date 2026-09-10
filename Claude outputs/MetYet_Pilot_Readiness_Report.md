# MetYet Pilot Readiness Report

**Repository:** `/Users/davi1700/Documents/GitHub/metyet-app`
**Branch:** `mobile-deal-timeline-prototype`
**HEAD:** `2665f3981c71f51751fa31016620e513e2c15a9c` ("Gate final agreement and persist deal receipt", 27 Aug 2026)
**Audit date:** 10 Sep 2026
**Mode:** Read-only. I checked the repo, branch, HEAD and clean working tree before starting, and checked them again at the end: nothing changed.

All file:line references are to HEAD. "Probe" means I ran a short Node script in memory against the real `domain/` modules, without writing any files, to confirm a behaviour. I did not rely on reading the code alone for those points.

---

## A. Executive assessment

### What do we actually have today?

MetYet today is a **single-browser, client-only React prototype with a well-thought-out domain core**.

- **Domain core.** `domain/metyet-domain.js` holds pure functions for:
  - exact card identity;
  - derived goal state;
  - the Value Trade and final-cash negotiation reducers, including one-move-at-a-time rules;
  - signed cash direction and settlement wording;
  - the deal receipt;
  - partner-scoped conversation keys.

  Much of this is good, carefully reasoned logic that matches the domain contract, and it is worth keeping.
- **Store.** Around the core sits an in-memory store (`domain/metyet-store.js`). A shell (`shell/MetYetPrototype.jsx`) mounts one store per browser tab. It lets a person choose to be "Northline Cards" (`p-self`) or "Casey Lin" (`c12`) and switch between them.
- **Data.** Everything begins from a hard-coded seed world: 84 cards, 4 partners, 13 collectors, 81 goals and 42 opportunities, all belonging to `p-self`. The app uses fixed clocks: 9 Aug 2026 in the Trusted Partner (TP) app and 14 Aug 2026 in the Collector app.
- **Tests.** 2,530 tests pass. The 54 failures are all caused by the audit environment, not the product; see §9. Most tests render React or match regexes against source files. A smaller set tests domain and store behaviour directly.
- **Hosting.** `app.metyet.io` is a static GitHub Pages build of `main`, built with demo controls turned **on**. This branch is 13 commits ahead of `main` and has not been pushed, so none of the audited work is deployed.

### Can real users pilot it today?

**No.** Two people on two devices cannot take part in the same deal at all. There is no server, no shared database and no network traffic apart from fonts and card images.

Even a single user loses everything on refresh; the app returns to the seed world. Nobody can sign in. The only "identity" is a persona button, and every visitor to the hosted site is the same Northline Cards or the same Casey Lin. Anyone can reset the world or act as the other side.

### What fundamentally prevents it?

1. **No source of truth outside the browser tab.** There is no persistence, backend, sync or concurrency control.
2. **No identity or authorization.** Seats come from a persona chooser and hard-coded ids. Every action takes `by: "tp" | "collector"` as a plain argument, and nothing checks that the caller is that seat, owns the records, or is a participant.
3. **The action layer is not yet a safe command boundary.**
   - Many actions skip stage, turn and active-deal checks.
   - Raw `patchOpportunity` and `store.set` are public.
   - The TP app bypasses the store's actions almost completely: accepting a price is the only TP write that goes through a store action.
   - Probes showed that agreed terms can be changed after agreement, and that a **completed** deal can be reopened.
4. **The visibility boundary is not applied.** The whole world is inside every browser. The TP app reads raw binder rows, including the collector's private reference value, and the TP opportunity queue is not filtered by partner.
5. **The demo world is the only world.** There is:
   - no onboarding, and no model for a Collector–TP relationship (the contract has none either);
   - no real photos (text tokens stand in for images);
   - an 84-card embedded catalog;
   - controls that impersonate the counterparty, which ship in the hosted build.

### Is the architecture a reasonable foundation?

**Partly. Keep the domain core and the persona UIs, and replace the runtime underneath them.**

- **Keep:** `metyet-domain.js` (identity, settlement, `TRADE` reducers, receipt, conversation keys), the idea of a single store read through two views, `collector-view.js`, and most of the Collector UI. These are sound and have a lot of test coverage. Rebuilding them would waste the most valuable work in the repo.
- **Replace before adding features:**
  - the in-memory store as the source of truth;
  - `useShared` whole-collection writes in the TP app;
  - `patchOpportunity` and `store.set` as client-reachable mutations;
  - the persona shell;
  - seed-as-data.

  Build a server-side **command layer**: one validated command per canonical action, executed against a database in a transaction, with a **per-user view** of the data returned to each client.

The domain code is plain CommonJS JavaScript, so it can run unchanged in a Node server. That makes this a relatively small change rather than a rewrite.

The biggest single refactor is the TP app's mutation paths. They must be rerouted to commands, but the screens themselves can stay.

---

## B. Current architecture map

### Runtime from startup to interaction

1. **Build.** `site.build.mjs` bundles `site-src/main.jsx` with esbuild, including React, and defines `__METYET_DEMO__: "true"` and `__METYET_DEV__: "false"` (`site.build.mjs:78-82`). It writes `site/index.html` and a `CNAME` for `app.metyet.io` (`:90`). `.github/workflows/deploy.yml` runs this on every push to `main` only; it runs `npm ci` and `build:site`, and **no tests**.
2. **Mount.** `site-src/main.jsx` renders `<MetYetPrototype/>`.
3. **Shell.** `shell/MetYetPrototype.jsx:139-148` creates **one** store with `createStore(buildCanonicalSeed({ review: DEMO }))` and keeps it in a React ref. `persona === null` shows the chooser (`:157-187`). Once a persona is picked, a "Prototype" strip shows **Switch persona**, **Scenario** (Collector only, DEMO) and **Reset demo** (`:200-257`). The same store is passed to `<MetYet partnerId="p-self"/>` or `<MetYetCollector collectorId="c12"/>` (`:263-265`).
4. **Reads.**
   - Collector: `useSyncExternalStore`, then `collectorView(state, collectorId)` (`collector/MetYetCollector.jsx:5717-5732`).
   - TP: `useShared(store, key)` for each collection (`src/MetYet.jsx:2294-2302`).
5. **Writes.**
   - Collector: mostly `store.actions.*`. The exceptions are price counters and trade selection, which go through `patchOpportunity` (`:5837-5861`), and new catalog records, which go through `store.set` (`:5744-5752`).
   - TP: whole-collection replacement via `store.set({...cur, [key]: next})` for nearly everything. Accepting a price is the one exception (`src/MetYet.jsx:2989`).
6. **Subscribers.** Every `set` notifies all subscribers in the same tab. Nothing leaves the tab.

### Key modules

| Module | Lines | Role | Assessment |
|---|---|---|---|
| `domain/metyet-domain.js` | 931 | Identity key, lifecycle stages, derived goal state, settlement maths, signed cash and settlement wording, `nextActor`, Value Trade / Deal reducers (`TRADE`), `INVARIANTS`, `REFUSE`, card search and identity picking, receipt, conversation threads | **Keep.** Mostly pure and well documented. Known defects: `nextActor` (see D). |
| `domain/metyet-store.js` | 526 | In-memory store (`get/set/sub/actions/reset`), about 35 actions | **Refactor into server commands.** Guards are uneven, and `set`/`patchOpportunity` are exposed. |
| `domain/metyet-entities.js` | 99 | Interest helpers, matching (`partnersHolding`, `demandForIdentity`), `binderCopyForPartner` (removes `market`) | Keep the ideas. The privacy view is **never used by the TP app**. |
| `domain/collector-view.js` | 320 | Collector-scoped selectors, `turnFor`, `tradeGroups`, `pursuitFor`, relationship and freshness summaries | Keep. It becomes the Collector's server-side view. |
| `shell/MetYetPrototype.jsx` | 273 | Persona chooser, the one store, scenario and reset | **Remove for the pilot** and replace with sign-in and seat resolution. |
| `src/MetYet.jsx` | 7,861 | TP app, seed builders (`buildCanonicalSeed`, `demoDealFixture`, `demoDealStage`), shared UI primitives the Collector imports (`TradeFields`, `CounterFields`, `emptyTradeCard`, …), 11 collector-simulation panels plus two other demo controls | UI is salvageable. **Mutation layer and seed must move out.** |
| `collector/MetYetCollector.jsx` | 5,930 | Collector app (Goals / Trade Binder / Trusted Partners, deal pages, mobile deal timeline), `ReviewPanel`, `DemoPartnerResponse`, `SimulateTP` | UI is largely salvageable. Demo panels and three direct mutations must go. |
| `shared/CardIdentityPicker.jsx` | 154 | Search, then edition, grade (PSA only) and condition | Keep. Needs a real catalog behind it. |
| `shared/dev-flag.js`, `shared/demo-flag.js` | 46 / 56 | Build-time DEV/DEMO flags; DEV implies DEMO | The pilot build currently sets DEMO=true. |
| `build-all.mjs`, `tests/fixture-build.mjs`, `prod.build.mjs`, `site.build.mjs`, `dev-server.mjs`, `build-preview*.mjs` | — | esbuild bundles for tests (`dist/`), the site (`site/`), dev, and previews for Claude's artifact viewer | Fine for now. |
| `index.html`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, `tailwind.config.js`, `tsconfig*.json`, `src/index.css` | — | **Leftover Vite/Bolt scaffold.** `@vitejs/plugin-react` and tailwind are not in `package.json`. | Dead code. Technical debt only. |
| `pokemon_cards.json` | 0 bytes | Empty | Not referenced. |
| `README.md` | 18 | Describes the generated preview files, not the app | Documentation debt. |
| `harness/` | 4 files | Playwright mobile screenshot review, which writes to `artifacts/` | Development tooling. |
| `tests/` | 94 files | See §9 | — |

---

## C. Pilot journey matrix

**Reading rule.** "Works today" means it works for a real user on their own device with persisted state. By that standard **nothing** works today, because there is no persistence or identity. The classification below therefore describes behaviour inside the single-tab prototype:

- **Prototype** means the logic works in memory and would carry over once it is backed by a server and auth.
- **Partial** means it is incomplete or incorrect even in the prototype.
- **Missing** means it is absent.

### Collector

| Activity | Status | Evidence / notes |
|---|---|---|
| Access MetYet and identify self | **Missing** | Persona chooser (`shell/MetYetPrototype.jsx:58-65,157-187`). `c12` is hard-coded (`:28`; `collector/MetYetCollector.jsx:16`). |
| Return later to persisted state | **Missing** | In-memory store only. No storage or network APIs anywhere. Refresh reloads the seed. No URL routing (`nav` is local state, `MetYetCollector.jsx:5721`). |
| Establish a Trusted Partner relationship | **Missing** | Every partner in the world counts as "your" partner (`st.partners = state.partners`, `:5732`). No invite, accept or remove. The TP-side "InviteModal" only adds a local pending collector. |
| Goals: add, change tier, remove, derived state | Prototype | `addGoal`/`updateGoalTier`/`removeGoal` actions. Remove is refused while negotiating (store `:67`). **But** tier can be demoted mid-negotiation, which the probe allowed. New catalog identities are written by raw `store.set` (`:5744-5752`). |
| Choose exact card identity | **Partial** | 84 embedded cards (`src/MetYet.jsx:1171-1260`). PSA grades only (`metyet-domain.js:670`). New grade variants are created on the client with ids built from catalog length, which collide across devices. |
| Trade Binder: add copy with both photos | **Partial** | The invariant is enforced (store `:92`), but "photos" are the strings `front:new`/`back:new` (`MetYetCollector.jsx:5676`). No file or camera input. |
| Trade Binder: edit copy | Prototype | `updateBinderCopy`: identity cannot change; cert is locked while committed (store `:113-141`). |
| Trade Binder: remove copy | **Missing** | No UI. The store's `removeBinderCopy` has no live-trade guard (store `:144-147`); the probe confirmed it removes a copy that trade rows still reference. |
| View partners, profile, inventory freshness | Prototype | `PartnerDetail` (`:3046`). The partner's internal note (for example "Your shop.") is shown to collectors (`:3034`). |
| Matching / "Who has it" / For You | Prototype | `partnersWith` via exact identity (`collector-view.js:96-113`). Only as good as the seeded inventory. |
| Review Card and request photos | **Partial** | The request works (`requestPhotos`). The TP fulfils it with text tokens. There is no UI to end a review (`endReview` is unused), so after a stopped deal the goal stays tied to the first copy reviewed (`collector-view.js:61-88`). |
| Messaging and reach out | Prototype | `sendMessage` works in memory. Timestamps are fixed at `AT`. No notifications. |
| Open a deal (offer) | Prototype | `startOpportunity` with refusals for not Primary, already negotiating, and copy committed (store `:336-370`). It does **not** check that the collector owns the goal, that the partner owns the copy, or that the card matches; the probe accepted a mismatched start. |
| Agree on Price: counter / accept | **Partial** | A counter is a raw `patchOpportunity` append with no stage, turn, active or amount checks (`:5837-5839`). `agreePrice` has no stage, turn or active checks (store `:218-230`). |
| Select Trade: choose and submit cards | **Partial** | Raw `patchOpportunity` replaces `trade.cards` (`:5852-5861`) without checking ownership, stage, or whether the copy is committed to another live deal. Copies already accepted into another live deal are still offered (`collector-view.js:272-277`). |
| Value Trade: market value, then trade % | Prototype | Domain reducers enforce one move at a time and that the TP opens the percentage phase (`metyet-domain.js:439,447-448`). The **canonical turn indicator is wrong after a counter**; see D-9. |
| Deal: final cash and agreement | Prototype | Agreement is gated while cash is unresolved (store `:415-417`) and each seat agrees separately. The turn indicator is wrong; terms can still change after agreement (see §8). |
| Fulfillment: confirm plan, request revision, confirm receipt | **Partial** | The plan must come from the TP, but `nextActor` says it is the collector's move before any plan exists (probe). No stage or active guard (store `:435-468`). |
| Completion | **Partial** | The goal becomes satisfied through derivation. The `Completed` card always says "You paid" with `Math.abs(finalBalance)`, which is wrong when the TP pays the collector (`MetYetCollector.jsx:5316`). |
| Stop a deal, termination, history | **Partial** | `endOpportunity` keeps the record. Ended deals still show live stage controls (`:4094-4101`) whose actions don't check whether the deal is active. Opening history can crash if the goal was removed (`:4018-4019`). |
| "Your move" indicators and unread | **Partial** | Nav dot uses `turnFor`, which inherits the `nextActor` defects. Unread counts exist only on mobile and break under the fixed clock (`:3740`). No off-app notifications. |

### Trusted Partner

| Activity | Status | Evidence / notes |
|---|---|---|
| Access MetYet and identify self | **Missing** | Persona chooser. `SELF_PARTNER = "p-self"` is used instead of the `partnerId` prop in several places (`src/MetYet.jsx:1055,2739,3286,3255`). |
| Return later to persisted state | **Missing** | As for the Collector. |
| Maintain own profile | **Missing (UI)** | The store has `updatePartnerProfile` (store `:156`), but no UI calls it. |
| Inventory: add copy | Prototype | `addCopyToInventory` (`:3266`) bypasses `store.addInventoryCopy`. It can add catalog records. |
| Inventory: edit copy | **Partial, unsafe** | `saveCard` (`:3306-3308`) **overwrites the shared catalog record** (name, set, grade…), which silently changes the identity behind every goal, binder copy and deal using that `cardId`. Blank cost becomes 0. Hook-order violation in `CardModal` (`:7661-7663`). |
| Inventory: archive | Prototype | `archiveInv` (`:3325`) bypasses the action. Only a warning while a deal is committed. The risk check is by `cardId`, not by copy. |
| Actual photos (including answering requests) | **Partial** | `addCopyPhotos` writes `"copy:<invId>:front"` tokens (`:3354-3362`). No capture or upload. |
| Network demand / Cultivate / Coverage | Prototype | Derived from **all** goals. There is no network or relationship scoping. |
| Collector list, profile, invite | **Partial** | Every collector is visible. Opening a profile writes the shared `binderReviewedAt` (`:3251-3252`). Invite adds a local collector; nothing is sent. |
| Interest in a binder copy | Prototype | `setTradeInterest` (`:3255`) writes `interests` directly, not through `setInterest`. |
| Conversations | Prototype | `appendThreadEntry` through `useShared`, partner-scoped. Real `new Date()` timestamps are mixed with the fixed date. |
| Opportunities queue | **Partial** | Not filtered to this partner (`:3757`, and `StageDrilldown`, `Sidebar`, `CollectorProfile`). A deal with `p2` would appear in `p-self`'s queue with action buttons. |
| Agree on Price: accept / counter | **Partial** | Accept goes through `agreePrice`. Counter is a `patchOpp` append whose only guard is the UI's turn check (`:3005-3013`, `:4417`). `patchOpp` builds from render-time `opps` (`:2916-2926`), so a concurrent change can be lost. |
| Select Trade: review proposed cards | Prototype | `tpReviewInclusion` (`:3066`) plus `closeSelection`. |
| Value Trade | Prototype | `patchCard`, then domain reducers (`:3134-3151`). |
| Deal: final cash and agreement | Prototype | `dealAdjust`/`dealAgree` (`:3170-3183`). |
| Fulfillment: propose plan, confirm handoff | **Partial** | `proposeFulfillment` checks only whether the button is disabled (`:5125`). `confirmHandoff` does not check stage or ended status, so an **ended** deal can be moved to `completed` (`:3215`, `:5413`). |
| End a deal | **Partial** | The TP's `endOpportunity` writes a different set of fields (`archivedFrom`, `outcome`…, `:3101`) from the store's (`endedAt`, `endedStage`, store `:513-516`). |
| Completed and history | **Partial** | Relationship history reads `activity`, which only TP handlers write, so collector moves never appear. |
| Acting only as themself | **Missing** | 11 ungated `<SimBlock>` panels, plus "Send as … (demo)" and a simulated Add Binder Copy modal, let the TP act as the collector, including making offers that bypass `startOpportunity` (`:4104`, `:2950`, `:5270`). |

---

## D. Domain-contract compliance

**Status key:**

- **Enforced:** implemented and enforced in the domain or store action.
- **UI-only:** implemented, but only the UI prevents violations.
- **Partial:** implemented with gaps that can actually be reached.
- **Simulation:** true only inside the single-tab prototype.
- **Missing:** not implemented.
- **Unverified:** could not be established from the repo.

| # | Contract requirement | Status | Evidence |
|---|---|---|---|
| D-1 | **Exact card identity**: 8 dimensions, one matching rule (§1) | **Partial** | `identityKey` (`metyet-domain.js:20-23`) is used by all matching (`metyet-entities.js:59-69`) and by thread keys (`:880`). Enforced for matching. **But** the TP's inventory edit overwrites the shared catalog record in place (`src/MetYet.jsx:3306-3308`), which changes the identity of every record pointing at that `cardId`. Grades are PSA-only (`metyet-domain.js:670-671`). |
| D-2 | **Physical-copy identity**: transactions reference exact copy ids (§1) | **Partial** | New deals store `invId` (store `:336-370`) and trade rows store `binderId`. Problems: all 42 seeded deals have `invId: null` (probe of `buildCanonicalSeed`); `startOpportunity` does not check the copy belongs to `partnerId` or matches the goal's card (probe accepted a mismatch); `removeBinderCopy` leaves trade rows pointing at nothing (probe); seeded binder photo tokens are keyed by `cardId`, not copy (`src/MetYet.jsx:1435`). |
| D-3 | **Goal / Binder / Inventory ownership** (§1) | **Partial** | Owner fields exist on every row. No action checks that the caller is the owner (`collectorId`/`partnerId` are plain arguments). The TP app writes `partnerId: "p-self"` directly (`src/MetYet.jsx:3286`). |
| D-4 | **Visibility is a domain rule, enforced at the view boundary** (§3) | **UI-only** | `binderCopyForPartner` exists (`metyet-entities.js:78-82`) but is **never called** in `src/`, `collector/` or `shell/`. The TP reads raw `binder` (`src/MetYet.jsx:2688`). Every client holds the entire world. Collector-side filtering is thorough (`collector-view.js`). |
| D-5 | **Binder reference value never reaches a partner** (Invariant 8) | **UI-only, with 2 leaks** | TP screens don't show `market` in normal use. Leaks: the TP simulation panel pre-fills an input with `binderRef.market` (`src/MetYet.jsx:4715`); the hosted Collector "Partner response" demo writes the collector's `b.market` into the partner's `tpMarket` and thread (`collector/MetYetCollector.jsx:2343-2345`). Tests check a view that the test builds itself, not the real TP app. |
| D-6 | **Draft negotiation input private until submitted** (§3) | **Enforced** | All drafts live in component state (Collector `:4236, 4627-4630, 4933, 5487`; TP `CounterFields`/`adjDraft`). Nothing is written until a propose or counter action runs. |
| D-7 | **Conversation visible to participants only** (§3) | **Partial** | The thread key includes the partner (`metyet-domain.js:880-881`). Both views scope by participant. Issues: the whole thread set is in every client; the TP "activity" history is not scoped by partner (`src/MetYet.jsx:7136`); threads are keyed by card identity rather than the "optionally about Goal / Copy / Opportunity" context in §2. |
| D-8 | **Negotiation privacy between partners** | **Partial** | `REFUSE.copyCommitted` doesn't reveal who holds the copy (`metyet-domain.js:635-638`). But the TP opportunity queue, drilldown and profile are **not filtered by `partnerId`** (`src/MetYet.jsx:3757`, `5821`, `7137`), and `StageDrilldown` searches all partners' inventory (`:5813`). |
| D-9 | **Every stage has exactly one owner; one stored actor** (§4) | **Partial (defective)** | There are two independent turn engines: canonical `D.nextActor` (`metyet-domain.js:268-309`, used by the Collector through `turnFor`) and the TP's `nextAction` (`src/MetYet.jsx:2026-2090`). Probes show `nextActor` is **wrong**: (a) in Value Trade after the TP counters the collector, it still says partner (`:288-292`); (b) in Deal it reads `deal.proposedBy`, **which nothing writes** (`:297-298`), so a collector proposal or a one-sided agreement still says collector; (c) in Fulfillment before any plan it says collector, though the TP must propose (`:301-305`). The two personas can both show "your move", or both show "waiting". |
| D-10 | **Only the collector opens a negotiation** (§4) | **UI-only** | `startOpportunity` has no seat parameter. The TP simulation calls `collectorMakeOffer` (`src/MetYet.jsx:2950`), which creates a deal **without** `store.startOpportunity` or the copy-commitment check. |
| D-11 | **Reach out never creates an Opportunity** (Invariant 2) | **Enforced** | `reachOut` / `sendMessage` only add thread entries (store `:304-320`). |
| D-12 | **TP Interest is not a commitment; it references an exact BinderCopy** (Invariants 3, 4) | **Enforced** | Stored as `{partnerId, binderId, at}` (store `:204-209`; `metyet-entities.js:42-48`). The TP writes the same shape directly (`src/MetYet.jsx:3255`). |
| D-13 | **BinderCopy requires both photographed faces** (Invariant 5) | **Enforced (placeholder photos)** | `addBinderCopy` / `updateBinderCopy` refuse (store `:92, 133-135`); tested. The "photos" are text tokens (`MetYetCollector.jsx:5676`). |
| D-14 | **Select Trade establishes no value** (Invariant 6) | **Enforced (by data shape)** | Trade rows start with all value fields null (`emptyTradeCard`, `src/MetYet.jsx:1607`), and the receipt shows no values at stage 2 (`metyet-domain.js:814-820`). There is no `proposeTradeSelection` command; submission is a raw patch. |
| D-15 | **Interest orders Select Trade but does not gate it** (Invariant 7) | **Enforced** | `tradeGroups` (`collector-view.js:272-277`). |
| D-16 | **One active negotiation per Goal** (Invariant 1) | **Enforced** | `startOpportunity` → `INVARIANTS.oneNegotiationPerGoal` (store `:340`; `metyet-domain.js:587`). Tested directly. The TP simulated-offer path repeats the check itself (`src/MetYet.jsx:2957-2961`). Demoting the goal to Secondary mid-deal is not refused (probe). |
| D-17 | **Agreed terms preserved downstream; Deal moves cash only** (Invariant 9) | **Partial (violations reachable)** | The reducers do lock agreed market, % and cash (`metyet-domain.js:424, 446, 478`). But the actions lack stage and active checks. Probes showed: `agreePrice` during Fulfillment resets the stage to Select Trade and rewrites the price; `agreePrice` on a **completed** deal reopens it and un-satisfies the goal; `withdrawTradeCard` in Fulfillment changes the balance while both agreements stay true; `dealAdjustRespond` after agreement clears both agreements and replaces the final figure. Also D-1 (catalog edits). |
| D-18 | **Signed cash direction** (§6) | **Enforced** | `calculatedBalance` / `cashDirection` / `settlement` (`metyet-domain.js:94-192`); tested directly. One UI defect: Collector `Completed` shows "You paid" with `Math.abs` (`MetYetCollector.jsx:5316`). |
| D-19 | **Successful completion satisfies the Goal; no separate mutation** (Invariant 10) | **Enforced** | `goalState` (`metyet-domain.js:61-66`). Undermined by the reopen defect in D-17. |
| D-20 | **Termination unlocks the Goal and keeps history with terms intact** (Invariant 11) | **Partial** | `endOpportunity` sets `declined` and keeps terms (store `:513-516`). But: ended deals remain mutable (probe: `agreePrice` on an ended deal changed stage and price; TP `confirmHandoff` can complete an ended deal, `src/MetYet.jsx:3215`); the TP writes a different "ended" field set (`:3101`); the hosted demo scenario loader **deletes** the goal's deal history (`src/MetYet.jsx:2116-2143`, called from `MetYetCollector.jsx:5814-5822` and `shell/MetYetPrototype.jsx:216-218`). |
| D-21 | **Goal state is derived, never persisted** (§6) | **Enforced** | No `goal.status` exists. The TP's `inDeal` counts ended deals (`src/MetYet.jsx:2800`), which is a UI-level drift, not a stored second truth. |
| D-22 | **Other derived values** (trade value, balance, supply/demand, "new since review") | **Enforced, one exception** | `tradeValueOf` (`:78`), `calculatedBalance` (`:94`), identity matching (`metyet-entities.js:59-69`). "New since review" uses one shared `collector.binderReviewedAt` (`src/MetYet.jsx:3252`) instead of a per-partner timestamp, and the fixed clocks make `newSince` meaningless. |
| D-23 | **Canonical actions: one path per operation, wrapped by persona permission** (§7) | **Partial** | Present, under different names: goals ×3, add/remove inventory, binder ×3, `setInterest`, `reachOut`, `sendMessage`, `startOpportunity`, `agreePrice` (≈acceptPrice), `reviewTradeCards`, `tradeMarketRespond` / `tradePercentRespond`, `dealAdjustRespond`, `dealAgree`, `proposeFulfillment`, `confirmHandoff` (completion is implicit), `endOpportunity`. **Missing:** `proposePrice` (counter), `proposeTradeSelection`, `updateInventoryCopy`. **Persona permission: none.** The TP app bypasses almost every action (`src/MetYet.jsx:2294-2302`). |
| D-24 | **Refusals belong to the action**: removeGoal / startOpportunity / addBinderCopy (§7) | **Enforced** | Store `:67`, `:340`, `:92`. |
| D-25 | **One mutation → one canonical state change → two perspectives** (§8) | **Simulation** | True within one tab (one store object). There is no cross-device reality. Violations inside the prototype: the TP writes activity and a thread milestone as two records for one mutation (`src/MetYet.jsx:2921-2924`); collector moves never reach `activity`. |
| D-26 | **Lifecycle transition conditions** (§4 table) | **Partial** | Select Trade → Value Trade (`closeSelection`, `metyet-domain.js:539-547`) ✓. Value Trade → Deal (`closeValuation`, `:563-568`) ✓. Deal → Fulfillment on both agreeing (store `:400-432`) ✓. Fulfillment → Completed on both confirming (store `:457-468`) ✓. **Agree on Price:** `agreePrice` lets a party accept its **own** standing offer (probe), so "both accept a figure" is not enforced. Any stage can be jumped with `patchOpportunity`. |
| D-27 | **§9 prototype-only items are not carried forward** | **Simulation (all still present)** | In-memory store, seed fixtures, fixed dates, id formats (`p-self`, `cc0`, `o-review`), single-file components with inline CSS, photo placeholders, demo controls acting as the other party, specific view functions. All expected in a prototype, and all must be replaced for the pilot (see §12). |
| D-28 | **Rules in code that the contract does not state** | **Unverified (needs decision)** | Primary tier required to open a deal (`metyet-domain.js:619-622`). Physical copy locks at price agreement (`:602-604`). Review Card pre-deal step (`:775-778`). Inventory photos optional, marked "CONTRACT CHANGE" (store `:342-349`). Fulfillment plan confirmation step. Cert lock. These look deliberate, but the contract has not been updated (see H-5). |

**Contract gaps and inconsistencies:**

- **No relationship entity.** The contract has no Collector↔Trusted Partner relationship entity, yet the pilot definition requires "establish the appropriate relationship", and §3 gives TPs read access to Goals as "network demand" without defining the network.
- **Secondary / Primary Goal stages.** §4 lists them as Opportunity lifecycle stages. The store never creates an Opportunity at those stages, and goal tier lives on the Goal. The TP's `nextAction` still handles `secondary` / `primary` opportunity stages (`src/MetYet.jsx:2029-2032`).
- **Unspecified outcomes.** The contract does not say what happens to the TP's inventory copy and the collector's binder copy after completion (ownership transfer or archive).

---

## E. Pilot blockers

Only items that prevent safe, useful real-user piloting are listed. **P0** means we cannot pilot without it. **P1** means resolve before or during the earliest controlled pilot. **P2** means useful but can wait.

### P0: cannot pilot without

| # | Blocker | Why it blocks | Evidence |
|---|---|---|---|
| P0-1 | **Server-side source of truth and persistence** | Two devices cannot share a deal, and a refresh destroys everything. | `metyet-store.js` in-memory store; `shell/MetYetPrototype.jsx:139-148`; no storage or network APIs anywhere. |
| P0-2 | **Real authentication with identity-bound seats** | Every visitor is the same Northline Cards or Casey Lin. | Persona chooser (`shell/MetYetPrototype.jsx:58-65`); hard-coded `p-self` / `c12` (shell `:27-28`, `src/MetYet.jsx:1055`, `MetYetCollector.jsx:16`). |
| P0-3 | **Authorized, validated command layer on the server** | Any client can act as either seat, write out of turn, alter agreed terms, reopen completed deals, and mutate other users' records. Each command must derive the seat from the session (not `by`) and check participant, ownership, stage, active status, turn, and copy consistency. Add the missing commands: price counter, trade selection, inventory update. Remove `patchOpportunity` and `store.set` from anything a client can reach. | Probes in D-17, D-20, D-26 and D-2; TP `useShared` whole-collection writes (`src/MetYet.jsx:2294-2302`); Collector raw patches (`:5837-5861`, `:5744-5752`). |
| P0-4 | **Server-side visibility views** | A TP's browser currently holds every collector's private reference values, every partner's deals and costs, and every conversation. The UI hiding them is not privacy. | D-4, D-5, D-8. |
| P0-5 | **Multi-device refresh and stale-write protection** | Parties must see each other's moves, and a stale screen must not overwrite a newer state. Polling plus a version check is enough; real-time is not required. | `patchOpp` builds from render-time `opps` (`src/MetYet.jsx:2916-2926`); `addCopyPhotos` writes from snapshots (`:3360-3362`). |
| P0-6 | **Remove counterparty simulation, scenarios, reset and persona switching from the pilot build and API** | Any pilot user could act as the other party, fabricate agreement, or wipe deal history. | 11 ungated TP `<SimBlock>` panels plus "Send as … (demo)" (`src/MetYet.jsx:4104, 4609, 7590`); `DemoPartnerResponse` and `ReviewPanel` gated only on DEMO, which the hosted build sets true (`MetYetCollector.jsx:1437, 2286`; `site.build.mjs:81`); shell Scenario / Reset / Switch persona (`shell/MetYetPrototype.jsx:200-257`); `st.simulate` exposes all actions (`MetYetCollector.jsx:5776`). |
| P0-7 | **Pilot data instead of seed data; real clock** | Real users must not share the world with fictional collectors, 42 fake deals, "Review fixture" notes, or dates frozen in August. | `buildCanonicalSeed` (`src/MetYet.jsx:2161`); `TODAY` fixed in both apps (`src/MetYet.jsx:1047`, `MetYetCollector.jsx:31-32`). |
| P0-8 | **Relationship and onboarding model** | A real TP and Collector must be able to connect, and visibility needs a defined "network". Needs founder input (H-1). | Contract has no relationship entity; `st.partners = state.partners` (`MetYetCollector.jsx:5732`); TP sees all collectors (`src/MetYet.jsx:6816`); invite is local only. |
| P0-9 | **Real card catalog with stable ids; server-side identity resolution** | Pilot users' actual cards will not be in an 84-card embedded list. Creating identities on the client produces colliding ids. TP edits corrupt shared identities. | `CARDS_SEED` (`src/MetYet.jsx:1171-1260`); `resolveIdentity` (`MetYetCollector.jsx:5744-5752`); `saveCard` (`src/MetYet.jsx:3306-3308`). |
| P0-10 | **Real photo capture, upload and storage** for binder copies (Invariant 5) and inventory copies | Trades are judgements about physical condition; text tokens show nothing. | `front:new` tokens (`MetYetCollector.jsx:5676`); `copy:<invId>:front` (`src/MetYet.jsx:3357-3358`). |
| P0-11 | **One correct canonical turn owner used by both personas** | Wrong "Your move" or "Waiting" in 3 of 5 stages means the parties stall or need explaining, which the pilot definition rules out. | D-9 (probe-verified). |
| P0-12 | **Hosting for the backend: environments, secrets, backups** | Needed for P0-1 to P0-5 to exist in production. There is currently only a static Pages deploy from `main`. | `.github/workflows/deploy.yml`. |

### P1: resolve before or during the earliest pilot

| # | Item | Evidence |
|---|---|---|
| P1-1 | **Notification when it is your move** (email is enough) | No off-app notifications exist. In-app unread is mobile-only and broken by the fixed clock (`MetYetCollector.jsx:3740`; `metyet-domain.js:133`). |
| P1-2 | **Ended and completed deals read-only in the UI** (the server enforces this under P0-3) | Collector stage controls render for ended deals (`MetYetCollector.jsx:4094-4101`); TP fulfillment panel does too (`src/MetYet.jsx:5413`). |
| P1-3 | **Completion wording follows cash direction** | "You paid" with `Math.abs` (`MetYetCollector.jsx:5316`). |
| P1-4 | **React hook-order crashes** | `InlineDeal` returns before its hooks (`MetYetCollector.jsx:3396-3401`), so resizing across 560px mid-deal is likely to crash. Also `CardModal` (`src/MetYet.jsx:7661-7663`) and `DemoPartnerResponse` (`:2286-2289`, removed by P0-6). |
| P1-5 | **Pursuing an alternative partner after stopping a deal** | No UI calls `endReview`; `pursuitFor` keeps the first open review (`collector-view.js:61-88`); other partners' Review buttons are hidden (`MetYetCollector.jsx:5397-5410`). |
| P1-6 | **One ended-deal record shape** | TP `endOpportunity` (`src/MetYet.jsx:3101`) vs store (`:513-516`). |
| P1-7 | **History built from canonical events, not a TP-only activity log** | `activity` is written only by TP handlers. |
| P1-8 | **Minimal pilot admin and support tooling**: read-only views, a command audit log, account provisioning. Lets Matt diagnose problems without editing data or impersonating. | None exists. |
| P1-9 | **Error handling, client error reporting, server logs** | None exists. Refusals from `patchOpportunity`-based actions are `undefined`, so UI refusal checks never fire (store `:510-512`). |
| P1-10 | **CI runs the test suite and the new API tests on every PR** | CI builds the site only. |
| P1-11 | **TP can edit their own profile** | `updatePartnerProfile` has no UI. |
| P1-12 | **Collector can remove a binder copy** (refused while committed) | No UI; unguarded action (store `:144-147`). |
| P1-13 | **Pilot terms, privacy notice, consent** (founder decision H-9) | Real personal data and contact details (`partners.email/phone`). |
| P1-14 | **Inventory archive refused while the copy is committed** to a live agreed deal | `archiveInv` only warns (`src/MetYet.jsx:3325-3327`); probe: archived during a committed deal. |

### P2: useful, can wait

- **Third-party requests.** Hot-linked `images.pokemontcg.io` stock images and Google Fonts. Self-host, or confirm licensing.
- **Deep links and URL routing.** A URL per deal for notifications. Becomes P1 if notifications link directly into a deal.
- **Unread badges on desktop** (currently mobile only).
- **Partner inventory `cost` sent to collectors.** The field is included in the collector's data but not displayed (`collector-view.js:38,130`). The server views under P0-4 fix this by construction.
- **Duplicate goals by identity.** `addGoal` de-duplicates by `cardId`, not identity key (store `:55`). Fixed by construction under P0-9.

---

## F. Technical debt and post-pilot list

None of these block a controlled pilot. They are deliberately kept out of section E.

- **Split the two single-file components.** `src/MetYet.jsx` has 7,861 lines and `collector/MetYetCollector.jsx` has 5,930. Move their inline CSS strings out too. The contract calls this "prototype packaging".
- **Stop the Collector app importing UI primitives from the TP app.** `TradeFields`, `CounterFields`, `emptyTradeCard` and others come from `src/MetYet.jsx`; move them to `shared/`.
- **Delete the leftover Vite/Bolt scaffold.** That is `index.html`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `tailwind.config.js` and `tsconfig*.json`. Their dependencies aren't installed.
- **Delete the empty `pokemon_cards.json`.**
- **Replace the README**, which currently describes the preview files instead of the app.
- **Reduce regex-on-source tests.** 77 of 87 suites use them. Keep those that guard architectural rules and replace the rest with behaviour tests as screens change.
- **Remove preview generators for Claude's artifact viewer** (`build-preview*.mjs`) once they're no longer used.
- **Retire legacy fulfillment field names.** `tpDone`/`collectorDone` are read at `metyet-domain.js:339-348`.
- **Move to one turn engine.** Once P0-11 is fixed, remove the TP's separate `nextAction` and have both personas phrase the same actor.
- **Replace id formats** (`p-self`, `cc0`, `o-review`, `Date.now`/`Math.random` ids) with database-generated ids.
- **Consider TypeScript and runtime schema validation** for command payloads.
- **Replace polling with real-time** (SSE or websockets) if deal activity justifies it.
- **Add richer grading companies and catalog enrichment.** This becomes P0 if pilot users hold BGS/CGC slabs; see H-7.
- **Tidy branches.** Delete the three local `backup-before-*` branches once they're no longer needed. Align CI's Node 20 with local Node 22.
- **Add optimistic UI and offline tolerance.**
- **Build a separate demo environment**, if still wanted after the pilot (H-10).

---

## G. Proposed implementation sequence

The principle: **make the domain a strict command boundary first, in-process, where the existing 2,500 tests still run. Then move that exact code behind a server.** This avoids rebuilding working logic and turns every later phase into plumbing rather than product redesign.

**Recommended pilot stack.** This is an engineering choice, not a founder decision:

- **API:** a small Node service that `require`s the existing `domain/` modules unchanged.
- **Database:** Postgres. Normalized tables for accounts and entities, with each opportunity stored as a JSON document plus indexed ownership, status and `version` columns. The opportunity object shape already exists and is tested, so this avoids a schema rewrite.
- **Auth:** a managed provider using email magic link or OTP.
- **Photos:** S3-compatible object storage with signed URLs.
- **Transactional email:** for notifications.
- **Hosting:** the frontend stays a static build. The API runs on any managed Node host.

A BaaS such as Supabase (Postgres + Auth + Storage) is a reasonable alternative, provided commands run server-side and not as client table writes.

### Phase 0: lock pilot scope and decisions (days)

- **Objective:** answer H-1 to H-12 that affect the model (relationships, catalog scope, fulfillment modes, end-of-deal rules, post-completion copy state). Record them as a short addendum to `METYET-DOMAIN-CONTRACT.md`, including the code-introduced rules in D-28. Push this branch and merge it to `main` so the audited code is the baseline.
- **Affected:** contract doc, git branches.
- **Why first:** relationship scoping and catalog scope change the data model and view rules. Everything else depends on them.
- **Acceptance:** addendum approved by Matt; `main` contains `2665f39` or later; no feature work in flight.
- **Tests:** none.
- **Dependencies:** none.

### Phase 1: canonical command layer, in-process

- **Objective:** turn `metyet-store.js` actions into an `execute(actor, command, payload)` boundary where `actor = {seat, collectorId | partnerId}` comes from the caller's identity, never from the payload. Each command checks:
  - **participant:** the actor is this opportunity's collector or partner;
  - **ownership:** the goal, binder ids and inventory copy belong to the right party, and the copy matches the goal's identity;
  - **stage and active status:** nothing on ended or completed deals;
  - **turn:** from a corrected `nextActor`;
  - **invariants.**

  Specific work:
  - Add `proposePrice`/`counterPrice`, `proposeTradeSelection`, `updateInventoryCopy` (copy fields only, never the catalog) and `endReview`.
  - Make `agreePrice` accept only the *other* party's standing figure, and only at `agree-price`.
  - Guard `withdrawTradeCard` to Value Trade and `dealAdjustRespond`/`dealAgree` to Deal.
  - Guard fulfillment commands by stage and seat.
  - Refuse `removeBinderCopy` and `removeInventoryCopy` while committed.
  - Refuse tier demotion while negotiating.
  - Fix `nextActor` for Value Trade, Deal and Fulfillment, and write `ended` in one shape.
  - Remove `patchOpportunity` and `set` from the public surface.
  - Reroute **all** TP handlers (`src/MetYet.jsx:2671-3437`) and the Collector's `priceRespond`, `submitTrade` and `resolveIdentity` to commands. Delete `useShared` writes.
- **Affected:** `domain/metyet-store.js`, `domain/metyet-domain.js` (`nextActor`), `src/MetYet.jsx` handlers, `collector/MetYetCollector.jsx` `st` wrappers.
- **Why now:** this code becomes the server core. Doing it in-process keeps the existing render tests as a regression net and is independent of infrastructure.
- **Acceptance:** no UI code calls `store.set` or `patchOpportunity`. Every §7 action exists as a command. Every probe in D-17/D-20/D-26/D-2 is refused. Both personas show the same actor for every stage state.
- **Tests required:**
  - a **command × seat × stage matrix** asserting accept or refuse for every command;
  - a **randomized sequence test** (thousands of random valid and invalid commands from both seats) asserting that agreed price, market, %, and the final balance after agreement never change, and that completed or ended deals never change;
  - a turn-owner consistency test: `nextActor` matches which seat's commands are accepted;
  - the existing suite stays green.
- **Dependencies:** Phase 0.

### Phase 2: views as the visibility boundary

- **Objective:** `viewFor(state, actor)` returns only what the actor may see:
  - **TP:** no `binder.market`; only their own inventory cost; only their own opportunities, threads and interests; collectors and goals scoped by the relationship rule.
  - **Collector:** their own data, related partners' public profile and inventory without `cost`, and only their own threads and opportunities.

  Both UIs render **only** from the view. The TP app stops reading raw collections, and `binderCopyForPartner` or its successor is applied here once.
- **Affected:** `domain/metyet-entities.js`, `domain/collector-view.js`, a new TP view, both apps' read paths.
- **Why now:** the server will send exactly this. Defining it before the API means the API cannot leak.
- **Acceptance:** a deep scan of the TP view for every seeded collector finds no `market`, no other partners' opportunities or threads, and no `cost` in collector views. The TP opportunity queue shows only its own deals.
- **Tests required:** view privacy tests over the full seed plus adversarial fixtures (two partners, two collectors, overlapping cards), and the §3 visibility table encoded as tests.
- **Dependencies:** Phase 1; H-1 (relationship scoping).

### Phase 3: backend (persistence, auth, API) and infrastructure

- **Objective:**
  - **Database schema:** accounts, collectors, partners, relationships, catalog, inventory copies, binder copies, goals, interests, threads and entries, copy reviews, photo requests, opportunities (JSON document + `version`).
  - **Auth:** users mapped to exactly one seat record (or more, per H-4).
  - **API:** `POST /commands` runs Phase 1 `execute` inside a DB transaction with optimistic `version` (409 on stale), and stamps server time. `GET /view` returns the Phase 2 view.
  - **Operations:** a command audit log table; staging and pilot environments; secrets in the host's secret store; automated DB backups; structured server logs; a provisioning script to create pilot accounts and relationships.
- **Affected:** new `server/` package, deployment config, CI.
- **Why now:** it needs the finished command and view contracts from Phases 1 and 2.
- **Acceptance:**
  - two authenticated clients complete a deal against staging;
  - an unauthenticated request gets 401;
  - wrong-seat and non-participant commands get 403 or refusal;
  - a stale version gets 409;
  - a server restart loses nothing;
  - a backup restore has been tested once.
- **Tests required:** API integration tests (auth, authorization, refusal passthrough, concurrency with two simultaneous writes to one opportunity), migrations, seed-free startup.
- **Dependencies:** Phases 1 and 2; hosting account decisions.

### Phase 4: clients on the API, persona shell removed

- **Objective:** replace the in-memory store with an API-backed store exposing the same `get/sub/actions` interface, so screens change very little.
  - Load the view, send commands, refresh on focus, after each command, and on a short poll.
  - Loading, error and refusal states.
  - Sign-in screen, then route to the actor's seat.
  - Remove `MetYetPrototype`'s chooser, switcher, Scenario and Reset.
  - URL routes for goals, deals and partners, so users can return and notifications can deep-link.
  - Replace fixed `TODAY`/`AT` with server timestamps.
- **Affected:** `shell/` (replaced by an app shell), `site-src/main.jsx`, both apps' store wiring, `site.build.mjs` (pilot build defines DEMO=false).
- **Why now:** it needs the API.
- **Acceptance:** on two phones, a TP and a Collector run a deal from offer to completion with no demo UI visible. Reloading at any stage returns to the correct state. Signing out and back in days later shows the same history.
- **Tests required:** Playwright end-to-end with **two browser contexts** (two identities) against staging, including reload mid-stage; a build test asserting no simulation or demo symbols in the pilot bundle (extend `tests/site-build.cjs`).
- **Dependencies:** Phase 3.

### Phase 5: onboarding, relationships, catalog, photos

- **Objective:**
  - **Relationships:** per H-1, e.g. the TP invites a collector by link and the collector accepts. TP profile editing UI (`updatePartnerProfile`).
  - **Catalog:** import the normalized card table referenced in `src/MetYet.jsx` comments (32,598 cards; the file isn't in the repo) server-side with stable ids and add grade companies per H-7. Identity resolution becomes a server command.
  - **Photos:** camera or file capture for both faces; upload to object storage; server-side both-faces check for binder copies (Invariant 5); inventory photo fulfilment of requests; signed-URL rendering replacing text tokens.
- **Affected:** `shared/CardIdentityPicker.jsx` (search against the API), `AddCopy` (`MetYetCollector.jsx:5604`), `AddInventoryModal`, `PhotoDemand`, Partners and Collector lists, `Art`/`ActualCardPhoto`.
- **Why now:** it builds on auth, API and storage. Partly parallel with Phase 4 once Phase 3 exists.
- **Acceptance:** a new collector with no seed data can accept an invite, add a real goal and a binder copy with real photos, and see the partner's real inventory. The TP sees the collector only once they are related.
- **Tests required:** upload validation (type, size, both faces), relationship-scoped view tests, catalog identity resolution idempotence (same identity gives the same id from two clients).
- **Dependencies:** Phase 3; H-1, H-7.

### Phase 6: pilot hardening and launch readiness

- **Objective:**
  - email notification when the turn changes to a user, and on new messages (P1-1);
  - client error reporting;
  - read-only admin and support view over the audit log (P1-8);
  - CI runs all tests on every PR (P1-10);
  - fix P1-2 to P1-7, P1-11, P1-12 and P1-14;
  - mobile QA pass with the existing harness;
  - terms and privacy notice (H-9);
  - pilot runbook (how to provision, how to handle a stuck deal *without editing data*).
- **Affected:** server notification hooks, both apps' known defects, CI workflow, docs.
- **Why last:** it depends on real flows existing, but must be done before inviting real users.
- **Acceptance:** a dry-run pilot with two internal accounts on two real phones completes: invite, goal, binder with photos, review, offer, counter, trade selection, valuation, cash, agreement, fulfillment, completion. Each party is notified when it's their move, nobody uses demo tools, and both return a day later to correct state.
- **Tests required:** notification trigger tests, a regression test for each fixed defect, and a full two-context E2E in CI.
- **Dependencies:** Phases 4 and 5.

---

## H. Open product and architecture decisions for Matt

1. **What is a Trusted Partner relationship, and how is it formed?** Does the TP invite, does the collector request, or is mutual acceptance required? Can a collector see or offer on partners they aren't connected to? Which collectors' Goals and Binders can a TP see: only connected collectors, or anyone on MetYet? The contract has no relationship entity, and the prototype treats everyone as connected.
2. **Pilot scope and fulfillment modes.** How many TPs and collectors, and where? Is fulfillment in-person only, or does shipping need to be supported (address, tracking)? This decides the fulfillment plan fields.
3. **TP accounts.** One login per shop, or several staff logins acting for one partner?
4. **Dual roles.** Can one person be both a Collector and a Trusted Partner? This affects the account-to-seat model.
5. **Confirm the rules the code introduced beyond the contract:**
   - a deal requires a Primary goal;
   - a physical copy locks to one collector once a price is agreed;
   - inventory photos are encouraged but not required before offering (the code comment says "CONTRACT CHANGE");
   - the Review Card pre-deal step;
   - the collector must confirm the TP's fulfillment plan;
   - cert is read-only while committed.
6. **Ending deals.** Can either party end a deal at any stage, including after both agreed and during Fulfillment? Should ending after agreement require a reason or be visible differently to the other party?
7. **Catalog scope for the pilot.** Pokémon only? Which languages? Which grading companies (the code is PSA-only)? Is the 32,598-card normalized table the source of truth, and who can add a missing printing?
8. **What happens to physical copies after completion?** Is the TP's inventory copy automatically archived or sold? Is the collector's traded binder copy removed, or marked traded (currently derived as "traded")? Does the TP gain the traded cards as inventory?
9. **Money, legal and data.** Confirm MetYet only records the agreed balance and moves no money in the pilot. Pilot terms, privacy notice and consent. Whether Matt, as admin, may read pilot users' private data (including reference values and conversations) for support.
10. **Demo experience going forward.** Retire the hosted demo, or keep a separate clearly labelled demo site (e.g. `demo.metyet.io`) with simulation controls, isolated from pilot data?
11. **Notification channel.** Is email acceptable for the pilot, or is SMS or push expected?
12. **Pilot success criteria.** Which outcomes (deals completed, time per stage, drop-off points) should be measurable? This decides what events the audit log must capture from day one.

---

## I. Confidence and unknowns

- **Test run environment.** I ran the suite in a scratch copy made with `git archive HEAD` outside the repo, on the Linux VM that backs the computer link.
  - `npm run build` could not run there, because `node_modules` holds the macOS esbuild binary and there was no network to install another.
  - The tests used the repo's existing `dist/` bundles, built at 19:29 UTC on 27 Aug. The last source change was at 19:29:09 and HEAD was committed at 19:36:33, so they very likely match HEAD, but I can't prove it.
  - Result: 2,530 passed and 54 failed. All 54 failures are the esbuild platform error in 8 build and flag suites.
  - Not run: `build-all`, `site.build`, the previews, or the Playwright harness. Running `npm run verify` on your Mac would confirm the full suite.
- **No live UI session.** Journey conclusions come from reading the code plus domain probes. Some runtime effects are inferred and marked as such: the hook-order crashes, broken image rendering, the stale "Send cards" button, and the history crash.
- **Deployed version unknown.** I did not inspect `origin/main` or the live `app.metyet.io`. The site deploys from `main`, which lacks this branch's 13 commits.
- **Missing catalog source.** The "Cards_Normalized-Table" CSV (32,598 cards) referenced in comments is not in the repo. I can't assess its quality or licensing.
- **Test coverage.** Test files were classified by reading headers and assertions, not every line of all 94 files.
- **Planned architecture.** A comment mentions "David's production architecture" (`domain/metyet-store.js:10`). I don't know whether a separate production architecture or team exists outside this repo. If one does, Phases 3–5 should be matched to it.
- **Scratch files.** The test run left a scratch copy in the linked VM's home directory (`$HOME/audit-copy`), outside your folder. It isn't visible in the repo and can be deleted.
- **Repo state.** Final state matches the start: branch `mobile-deal-timeline-prototype`, HEAD `2665f39`, `git status` empty, and file fingerprints unchanged.

---

## Appendix: supporting findings by audit area

### §2 Persistence and data

- **Where state lives.** State lives only in a JavaScript object inside a closure in `createStore` (`metyet-store.js:21-44`), held by a React ref in the shell. Standalone mounts each create their own store (`src/MetYet.jsx:2677`, `MetYetCollector.jsx:5708-5717`).
- **No browser storage or network.** There is no `localStorage`, IndexedDB, `fetch`, or WebSocket anywhere in the source. Two tests even assert that `localStorage` is absent.
- **What survives.** Persona switches survive. A reload, restart or change of device does not.
- **Seeded and demo data.** The entire world is seeded (see A). The review fixtures are added when DEMO is on (shell `:147`). The Scenario loader and Reset rebuild state from the seed.
- **What real data needs.** Durable tables for everything listed in Phase 3; server-stamped timestamps; stable ids; stored photos; an audit log; backups.

### §3 Authentication and authorization

- **Authentication.** None. Identity is the persona button plus hard-coded ids.
- **Authorization.** None. Actions accept `by`, `collectorId` and `partnerId` from the caller. `reviewTradeCards`, `proposeFulfillment` and `confirmFulfillmentPlan` take no seat at all.
- **Access boundaries.** The Collector app enforces them through view filtering. The TP app largely doesn't.
- **Before real users:** P0-2, P0-3 and P0-4.

### §4 Multi-user behaviour

- **Separate devices.** Two users on separate devices cannot share anything.
- **What simulates a second party today:**
  - the shared in-memory store with persona switching (shell);
  - TP `<SimBlock>` panels (11 uses, wrapper at `src/MetYet.jsx:4104`), including "Send as … (demo)" (`:4609`) and the simulated offer (`:5270`, `:2950`);
  - Collector `DemoPartnerResponse` (DEMO, `MetYetCollector.jsx:2285-2428`) and `SimulateTP` (DEV, `:2430-2615`, which includes a raw price counter at `:2448`);
  - `st.simulate` (`:5776`);
  - the Scenario loader (shell `:210-234`, `ReviewPanel` `:1435`).
- **What would need network sync:** every write path, turn indicators, unread counts, the copy commitment lock (two collectors racing to agree a price on one copy), and the photo request lifecycle.

### §8 Deal integrity: one transaction traced

1. **Offer.** `startOpportunity` creates `{stage:"agree-price", invId, listedPrice, priceThread:[offer]}` (store `:336-370`).
   - Checks: goal exists, goal is Primary, one negotiation per goal, copy exists, copy not committed.
   - Not checked: ownership, card match, partner owns the copy.
2. **Price.** Counters are raw appends (Collector `:5837`, TP `:3005`). `agreePrice` sets `agreedPrice` to the last entry's amount and `stage:"select-trade"`, and checks the copy lock (store `:218-230`).
   - **Can drift:** `agreePrice` can be called again at any later stage, or after completion, and overwrites `agreedPrice` and `stage` (probe).
3. **Trade selection.** The Collector `submitTrade` replaces `trade.cards` with `emptyTradeCard` rows referencing exact `binderId`s (`:5852-5861`). The TP decides per row, and `closeSelection` advances (`metyet-domain.js:539-547`).
   - **Can drift:** submission is unguarded and could replace an accepted package at a later stage. A binder copy can be removed while referenced (probe).
4. **Values.** `tcApplyMarket`/`tcApplyPercent` write agreed values only by accepting the other side's standing figure, lock once agreed, and enforce one move at a time (`:423-461`). `tradeValueOf = round(agreedMarket × agreedPercent)` (`:78`). `closeValuation` advances (`:563-568`).
   - **Sound**, apart from the turn indicator.
5. **Balance.** `calculatedBalance = agreedPrice − totalTradeValue` (`:94`) is signed: positive means the collector pays. The final figure is `deal.agreedAdj` when agreed (`:96-97`). `dealAgree` refuses while a cash figure is unanswered and needs both seats' bits (store `:400-432`).
   - **Can drift:** the price (step 2) and `withdrawTradeCard` (probe) both change the calculated balance *after* agreement. `dealAdjustRespond` after agreement replaces `agreedAdj`, because nothing prevents a proposal when no `agreedAdj` exists yet and the stage is already Fulfillment (probe).
6. **Fulfillment and completion.** `proposeFulfillment` (no stage or seat check), `confirmFulfillmentPlan`, then `confirmHandoff` per seat, then `completed` when both are done (store `:435-468`).
   - **Can drift:** actions work on ended deals. The TP path can complete an ended deal.
7. **Receipt.** `receiptForOpportunity` only displays values once each stage is reached, so the receipt itself never mutates anything (`metyet-domain.js:780-843`).

**Conclusion:** the *arithmetic and reducers* are trustworthy. The *action boundary* is not, and it is exactly where Phase 1 puts its work.

### §9 Testing

- **Scope.** 94 files; 87 suites in `tests/all.cjs`.
  - About 16 suites are mostly direct domain/store tests.
  - About 19 combine actions with rendering.
  - The rest render the TP or Collector app, or test build and flag tooling.
  - 77 suites also assert with regexes against source files.
- **Well covered directly:**
  - one negotiation per goal;
  - Primary-goal requirement;
  - binder both-photos (add and edit);
  - identity immutability of binder copies;
  - copy commitment lock and cert lock;
  - signed cash direction;
  - the agreement gate while cash is unresolved;
  - cash-only refused with live cards;
  - partner-scoped conversation privacy;
  - `goalState` derivation.
- **Weak or missing:**
  - reference-value privacy is tested only against a test-built view, never the real TP app;
  - `removeGoal` refusal is tested only through a disabled button;
  - **no test calls any action after its stage** (the preservation of agreed terms is untested at the action level);
  - no wrong-seat or non-participant tests;
  - price counters have no command and no turn test (one test calls this "the known gap", `tests/simulator-accept-parity.cjs:284`);
  - no tests for `nextActor` in the defective cases.
- **Persistence, auth, multi-user, concurrency:** none.
- **Setup.** Test fixtures often jump stages with `patchOpportunity`.
- **Harness.** `harness/mobile-ux-review.cjs` replays a scenario, asserts domain checkpoints, and writes screenshots and a manifest to `artifacts/` using Playwright and Chrome.
- **Why I didn't run tests in the repo.** Tests write to `dist/`. `tests/dev-flag.cjs` temporarily writes `dev/__guard_probe.jsx`. `site-build.cjs` wipes `site/`. Running in the repo would have modified files, hence the scratch copy.
- **CI** runs no tests.

### §10 Pilot infrastructure

- **Hosting.** Static GitHub Pages from `main` (`deploy.yml`), custom domain `app.metyet.io` (`site.build.mjs:24,90`).
- **Configuration.** No environments. The only configuration is the two build-time booleans DEV and DEMO.
- **Missing:** secrets (none exist; none needed yet), database, API, file or photo storage, email, error handling beyond UI refusal messages, logging, monitoring, analytics, backups.
- **External runtime requests.** Google Fonts (`src/MetYet.jsx:14`, `MetYetCollector.jsx:173`, shell `:68`) and hot-linked stock images from `images.pokemontcg.io` (`src/MetYet.jsx:1112-1165`).
- **Platform note.** `node_modules` is platform-specific (macOS esbuild). CI uses `npm ci` on Linux, which is fine.

### §11 Security, privacy and data integrity (what looks fine in the UI but fails with real users)

- **The whole dataset ships to every client.** Private reference values, inventory costs, every conversation and every deal are in the browser (P0-4).
- **Client-side enforcement is trusted.** Turn checks for price counters, fulfillment plan completeness, ended-deal gating and the send-package emptiness check exist only in the UI (TP `:4417, 5125, 5413, 4958`).
- **Invalid transitions can be reached** (D-17, D-20, D-26), including reopening a completed deal.
- **Shared-record side effects.** A TP editing inventory rewrites the catalog identity for everyone. A TP opening a profile resets "new" markers for all TPs.
- **Races.**
  - Whole-collection writes from render-time snapshots can lose concurrent changes.
  - Client-generated ids (`Date.now`, `Math.random`, `catalog.length`) will collide across devices.
  - The copy commitment lock is check-then-set with no transaction.
- **Demo controls leak and impersonate** (D-5, P0-6).

### §12 Prototype and demo residue

| Item | Location | Pilot action |
|---|---|---|
| Persona chooser, Switch persona, "Prototype" strip | `shell/MetYetPrototype.jsx:58-65,157-257` | **Remove** (replace with sign-in) |
| Scenario loader and Reset demo | shell `:210-243`; `demoDealFixture` / `demoDealStage` (`src/MetYet.jsx:2116-2160`) | **Remove** from pilot build |
| `ReviewPanel` ("Dev" tag, DEMO-gated) | `MetYetCollector.jsx:1435-1527` | **Remove** |
| `DemoPartnerResponse` (acts as TP; leaks reference value) | `MetYetCollector.jsx:2285-2428` | **Remove** |
| `SimulateTP` (DEV) and `st.simulate` | `MetYetCollector.jsx:2430-2615, 5776` | **Remove** from pilot build |
| 11 TP `<SimBlock>` collector-simulation panels, "Send as … (demo)", simulated Add Binder Copy (all ungated) and `collectorMakeOffer`, `collectorAddBinderCard`, etc. | `src/MetYet.jsx:4104` and call sites listed in section C | **Remove** |
| Seed world (`buildCanonicalSeed`, `CARDS_SEED`, `PARTNERS_SEED`, collectors, goals, `OPPS_SEED`, `ACTIVITY_SEED`, review fixtures) | `src/MetYet.jsx:1045-1520, 2161-2526` | **Replace** with DB data; keep as test fixtures only |
| Fixed clocks `TODAY` / `NOW` / `AT` | `src/MetYet.jsx:1047, 2915`; `MetYetCollector.jsx:31-32` | **Replace** with server time |
| Hard-coded seats `p-self`, `c12`, "Northline Cards" footer | shell `:27-28`; `src/MetYet.jsx:1055, 3469`; `MetYetCollector.jsx:16` | **Replace** with session identity |
| Photo tokens (`front:new`, `copy:<invId>:front`, `binder:<cardId>:front`) | `MetYetCollector.jsx:5676`; `src/MetYet.jsx:1435, 3357` | **Replace** with uploaded images |
| Client id generation (`Math.random`, `Date.now`, `catalog.length`) | store `:56, 242, 270, 360`; `MetYetCollector.jsx:5748, 5760`; `src/MetYet.jsx:1582, 1608, 3231, 3285, 3337` | **Replace** with server ids |
| Hard-coded fulfillment plan "Duluth, Minnesota / Saturday 2pm" | `MetYetCollector.jsx:2394-2396` | Removed with `DemoPartnerResponse` |
| `InviteModal` local pending collector | `src/MetYet.jsx:3336` | **Replace** with real invites (Phase 5) |
| DEV/DEMO flag modules | `shared/` | **Can remain.** Pilot build sets both false; the server must also refuse anything they gated. |
| Stock images from pokemontcg.io, Google Fonts | see §10 | **Can remain** for a controlled pilot (P2) |
| Preview generators, `harness/`, `artifacts/` | root, `harness/` | **Can remain** (developer tooling, never shipped) |
| Leftover Vite/Bolt scaffold, empty `pokemon_cards.json` | root | **Can remain**; delete later (F) |
