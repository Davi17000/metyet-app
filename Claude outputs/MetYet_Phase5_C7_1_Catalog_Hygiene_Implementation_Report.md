# MetYet — Phase 5 C7.1: Catalog Hygiene Before Provider Integration

**Branch:** `phase-5-c7-1-catalog-hygiene` · **Base:** `d05f6432a664ceef529f24ce03cbf8b25d92aa98`
**No provider integration, no import, no migration, no domain change.** Three small things and their tests.

> **A note on how this batch was produced.** An adversarial pass over the finished work found seven confirmed defects in it, two of which broke the batch's own headline claim. They are fixed, and §9 records each one rather than quietly repairing it — including the one where my correction to a stale pin reintroduced the same class of staleness in a different spelling.
>
> **§14 is an amendment**, added after the first hand-back. That hand-back surfaced one material issue it did not fix — the published demo still made live requests to a provider's image CDN — and the amendment closes it. A second adversarial pass over the amendment found ten more defects, including four that turned the full gate red. The decision trail is deliberately left intact: §4 below is what the first pass found and said, §14 is what was done about it.

---

## 1. Baseline

Verified on committed `main`, not assumed. **Branch created from `d05f643`, not merged.**

| Expected | Measured | |
|---|---|---|
| `main` = `d05f6432a664ceef529f24ce03cbf8b25d92aa98` | same | ✅ |
| 131 suites / 4,354 tests | 131 / 4,354 | ✅ |
| 4,353 passed / **1 failed** | 4,353 / **1 failed** | ✅ |
| build 345,079 bytes | 345,079 | ✅ |
| smoke 83,686 chars | 83,686 | ✅ |
| newest migration `0013_binders.sql` | `0013_binders.sql` | ✅ |
| allow-list 18 | 18 | ✅ |
| domain commands 49 | 49 | ✅ |

---

## 2. The stale pin: reproduction, root cause, correction

### Reproduced, in isolation, on committed `main`

```
$ node tests/phase5-c4-catalog-import.cjs
  FAIL no migration, and 0013_binders.sql is still the newest
       persistence changed: persistence/catalog-repository.js
                            — expected "", got "persistence/catalog-repository.js"
  49 passed, 1 failed
```

### Root cause — and the diagnosis was only half of what C7 said

The assertion was:

```js
const changed = execFileSync("git", ["diff", "--name-only", "97fdba3", "HEAD", "--",
  "persistence/"], { cwd: ROOT, encoding: "utf8" }).trim();
eq(changed, "", "persistence changed: " + changed);
```

**It asked the wrong question.** C4's claim is *"C4 did not change persistence"*. `97fdba3..HEAD` asks *"has persistence changed since C4's branch point"* — a claim about every batch since, which is not C4's to make. C6.1 changed `persistence/catalog-repository.js` correctly, and the pin went red for correct work.

**And it could not fail during the batch that broke it.** Confirmed: `git diff --name-only 97fdba3 df84c03 -- persistence/` (C6.1's parent — the C5 *merge*) is empty. The subject is git history, not the working tree, so while C6.1's change was uncommitted `HEAD` was `df84c03` and the range was empty. The assertion became false at the instant the work became a commit — after the last verify that could have caught it. That is the more important half: a pin that goes red is an inconvenience, a pin that goes green when it should not is a hole.

### Correction

Both ends are now fixed commits, declared once and shared by the three assertions in that file that ask what C4 changed:

```js
const C4 = Object.freeze({
  from: "97fdba3",   // Merge pull request #70 — C3.5, the batch C4 branched from
  to: "dc2fd25",     // Merge pull request #71 — C4 itself
});
```

Both verified from git, not taken from the C7 report: `dc2fd25` is `Merge pull request #71 from Davi17000/phase-5-c4-catalog-ingestion-runner` and an ancestor of `HEAD`. The `server/exposed-commands.js` pin immediately above already used these two literals — it had been through this once in C5 — so the constant removes a second spelling rather than adding one.

**No product code was touched. The migration claim beside it is unchanged** and still live: the newest migration is read from disk and must be `0013_binders.sql`.

### Is the corrected pin now vacuous? No — and that is tested

A frozen range could be empty, in which case "C4 changed no persistence" would be true of nothing. It is not:

- `97fdba3..dc2fd25` contains files, including `server/catalog/` — C4's own work.
- The same query narrowed to `server/catalog/` returns results, so the mechanism sees changes when there are any.
- Narrowed to `persistence/` it is empty, which is the claim.

**Being honest about what it now is:** with both ends frozen, that assertion can never change again. It is archaeology. That is what *"did C4 change persistence"* **means** — a question about a closed stretch of history has a permanent answer — and it is the correction the brief asked for. The live guard in that test is the newest-migration check, which reads the working tree and will catch a migration added by any future batch.

### Avoiding this class in future — the smallest honest answer

Not a framework: **one rule, stated as a test.**

> `tests/phase5-c71-catalog-hygiene.cjs` → *"no test compares history against a moving end"* — walks every file under `tests/`, finds git invocations, and fails any whose range touches `HEAD`.

It deliberately permits `git show HEAD:<path>` (reading a file at the tip is not a range), and it is **a tripwire, not a proof** — a ref held in a variable, or a shelled-out string, walks past any regex. The suite says so in its own comment. What it catches is the shape somebody reaches for without thinking, which is exactly how the original got written.

**The rule immediately caught my own new tests**, which is recorded in §9 ① because that is the more useful fact about it.

---

## 3. `pokemon_cards.json`: the complete dependency trace

Traced before editing anything.

| Where I looked | Result |
|---|---|
| Every tracked file (`git grep pokemon_cards`) | 10 hits: **all in `tests/`**, plus the file itself |
| `build-all.mjs`, `build.mjs`, `prod.build.mjs`, `app.build.mjs`, `site.build.mjs`, `build-preview.mjs`, `build-preview-unified.mjs`, `dev-server.mjs` | **none names it** |
| `package.json` scripts (25) | **none names it** |
| `harness/`, `docs/`, `render.yaml`, `.github/` | **none names it** |
| Every `readFileSync` / `readdirSync` in the repository | 11 call sites, **none reads it**: migrations, an auth token file, the CLI's two `--vocabulary`/`--records` flags, the config CA, the client bundle |
| Deployed `client/` (Render serves `app-src/main.jsx` → `client/`) | **no reference** |
| Prototype `src/MetYet.jsx` | **no reference** — its images come from a hardcoded `CATALOG_IMAGES` table, not from this file |
| Prototype `collector/MetYetCollector.jsx` | **no reference** — it constructs URLs from a `csvId` |
| Git history | entered in **one** commit, `de905bd "Add files via upload"`, and **never modified since** |

### Classification

| Reference | Class | Decision |
|---|---|---|
| `pokemon_cards.json` (13,610,686 bytes, 32,599 records) | **inert historical residue** — uploaded once, read by nothing, bundled by nothing | **REMOVED** |
| `tests/phase5-c4-catalog-import.cjs` ×2, `tests/phase5-c5-tp-inventory-correction.cjs` | **test-only**, and two of the four asserted the file *still existed* | **RESTATED** (below) |
| `tests/phase5-b6/b7/b8` neutrality regexes | **test-only**, name it in order to **forbid** it | **RETAINED unchanged** |

### Removal decision and evidence

**Removed.** The evidence is that nothing reads it: not a build path, not a script, not a runtime file, not a documented workflow. `npm run build` and `npm run previews` both succeed after the deletion, and the full gate is green. The only document that mentions it — `Claude outputs/MetYet_Pilot_Readiness_Report.md` — **recommends deleting it** (and describes it as "0 bytes | Empty", which was already wrong).

The engineering principle, stated as the brief framed it and no wider: **an unused third-party-derived dataset with no verified licence basis is not retained merely because old tests expected it.** No legal conclusion is drawn about the upstream data, and none is needed — the file is unused.

**Size impact:** 13.0 MB removed from the working tree; the tracked tree (excluding `.git`, `node_modules`, build output) drops to 9.9 MB — the deleted file was **larger than the entire rest of the repository**. No build artifact reintroduces it: `client/`+`app-src/` build to `app/main.js`, 299,510 bytes, containing **zero** provider names.

### The two pins that protected the file, restated as the property

Both asserted `fs.existsSync(pokemon_cards.json)`, which pinned *the file* rather than what the test was for.

- **C4** — *"ingestion reaches no bundled card dataset, and C4 touched none"*: no ingestion file names a bundled dataset; C4's frozen range did not touch it; and no such file has come back.
- **C5** — *"nothing C5 wrote reaches a bundled card dataset"*: same four files, and the existence assertion **inverted** — it must now be absent.

A first draft asserted "no JSON *array* at the repository root", which the adversarial pass correctly called close to theatre — a dump keyed by card id is an object, and a dataset one directory down is invisible. It now asks by **size and extension across everything tracked**: no tracked `.json`/`.jsonl`/`.ndjson`/`.csv`/`.tsv` over 256 KB, anywhere, `package-lock.json` excepted.

---

## 4. Every remaining PokémonTCG reference, and why

| Where | Count | Class | Why it stays |
|---|---|---|---|
| `src/MetYet.jsx` — `CATALOG_IMAGES` | 52 | **published demo content** | Live behaviour: ~50 hardcoded image URL pairs feeding the prototype's cards, pinned by five suites. Removing it is a demo-content decision that changes the prototype's appearance, not hygiene. |
| `collector/MetYetCollector.jsx:76` — `artUrl()` | 1 | **published demo content** | Constructs a CDN URL from a `csvId` at line 1325; pinned by `tests/collector.cjs`. |
| `tests/phase5-b5/b6/b7/b8/b81/c4` neutrality regexes | 7 lines | **test-only, protective** | They name the providers **in order to forbid them** in product code. Removing them removes the guard. |
| `tests/collector.cjs:615`, `tests/unified.cjs:277` | 2 | **test-only** | Parse the prototype's image URLs to check the right card resolves. |
| `Claude outputs/*.md` | several | **reports** | Describing this is their job. |

### One thing C7 got wrong, and this batch corrects

**C7 classified the prototype as "not deployed". That is false, and the distinction matters here.**

`.github/workflows/deploy.yml` runs `npm run build:site` on every push to `main` and publishes `site/`. `site.build.mjs` builds `site-src/main.jsx` → `shell/MetYetPrototype.jsx` → **`src/MetYet.jsx` and `collector/MetYetCollector.jsx`**. So those files are not a private prototype: they are **a published GitHub Pages site that hot-links `images.pokemontcg.io` on every page view.**

Two `production` builds also exist and neither is that site: `npm run prod` builds `src/MetYet.jsx` → `dist/MetYet.prod.js` (345,079 bytes — the number in §1, and **not deployed anywhere**), while Render deploys `npm run build:app` → `client/` (299,510 bytes). Three builds, three destinations, one word.

**Consequence, stated plainly:** this batch deleted an unused dataset on the grounds that there is no verified licence basis for it, while a published site continues hot-linking the same provider's CDN. That is a narrower application of the principle than the principle deserves. It is out of scope here — removing it changes the demo's appearance and touches five suites — and it is §12 debt with a founder decision attached.

> **SUPERSEDED BY §14.** The founder read this, decided, and sent the work back. The dependency is gone; the table above is preserved as the record of how it was found. The estimate "touches five suites" was wrong — it touched seven.

---

## 5. Deployed artwork behaviour, before and after

Reproduced before editing. **Deployed means `client/`**, which Render builds from `app-src/main.jsx`.

### Before

| Surface | Image absent | Image URL fails |
|---|---|---|
| `client/browse/CardBrowser.jsx` | name plate ✅ | **nothing** — no `onError` |
| `client/collector/sections/MyCards.jsx` | **empty box** | **nothing** |
| `client/collector/sections/TrustedPartners.jsx` | **empty box** | **nothing** |
| `client/collector/sections/Binder.jsx` | **empty box** | **nothing** |

Four `<img>` tags, **zero** `onError` handlers. All four guarded against the *absence* of a URL; none against one that does not load. (The `alt=""` means browsers collapse a failed image rather than showing a broken icon — so the failure mode was a silently empty tile, not a broken-image glyph. C7 said "broken-image icon"; that was wrong and is corrected here.)

### After

| Surface | Image absent | URL fails | Card unnamed |
|---|---|---|---|
| all four | **name plate** | **name plate** | **empty tile** |

The third column is deliberate and is where the first draft of this batch was wrong — see §9 ②.

---

## 6. Implementation: one primitive, four adoptions

`client/card-art.jsx`, 92 lines including its header.

```jsx
export default function CardArt({ src = null, name = "", wrap, plate, decorative = false }) {
  const url = text(src);
  const label = text(name);

  const [failed, setFailed] = useState(false);
  const [tried, setTried] = useState(url);
  if (tried !== url) { setTried(url); setFailed(false); }
  ...
}
```

**Why a shared primitive.** It genuinely removes duplication: four copies of the same two lines, each of which would have needed the same `onError`, the same reset, and the same reasoning about recovery. It is one component with four props and no media framework.

**Why the reset is a render-phase adjustment and not `useEffect`.** A `useEffect` reset runs *after* commit, so there is a real painted frame showing the fallback plate for a picture that is perfectly good — plus a `span`→`img` unmount/mount on every re-sort of a list containing a previously-failed tile. Adjusting state during the render that notices the URL changed is React's documented pattern for this and produces no intermediate commit. A test pins that the component holds **no effect at all**. Found by the adversarial pass; see §9 ③.

**Why `decorative`.** At the three collector surfaces the card's name is rendered as text an inch from the tile, so a plate carrying `role="img"` + `aria-label` makes a screen reader say the card twice. Those three pass `decorative`, which renders the visible text but `aria-hidden="true"`. Browse does not: in a grid of pictures the plate **is** the identification and nothing else names the card.

**Why an unnamed card gets an empty tile.** MetYet's client does not always know a card's name yet — `known` is filled by an async description whose failure is deliberately swallowed. A tile that invents a label in that case is not degrading gracefully, it is lying. Empty is the honest answer, and it is exactly the pre-existing behaviour for exactly the case where the pre-existing behaviour was right.

**Dimensions cannot shift.** The wrapper class is unchanged at all four sites (`br-art`, `mcs-group-art` ×2, `mcs-has-art`) and carries the `aspect-ratio:5/7` box; the primitive reproduces the same `<span className={wrap}>` shell. Verified byte-identical by the adversarial pass.

**Styling.** The orphan `.mcs-group-plate` (declared at `d05f643`, used by nothing in the whole repository) became `.mcs-art-plate`, shared, with a smaller type size for the 34px tile and a `-webkit-line-clamp` so a long name truncates at the **end** rather than being clipped top *and* bottom by the centring. See §9 ⑥.

**Nothing here fetches, constructs a URL, names a provider, or persists the failure.**

---

## 7. Tests changed

| File | Change |
|---|---|
| `tests/phase5-c4-catalog-import.cjs` | `C4 = {from, to}` constant; migration pin bounded to it; exposed-commands pin uses it; dataset pin restated; **new** meta-pin that history assertions name both ends |
| `tests/phase5-c5-tp-inventory-correction.cjs` | dataset pin restated, existence assertion inverted |
| `tests/phase5-c71-catalog-hygiene.cjs` | **new**, 27 tests |
| `tests/all.cjs` | registers the new suite |

**New suite, by section:**

- **A (3)** — the corrected range is real and not vacuous; the live migration claim survives; **no test anywhere compares history against a moving end**.
- **B (3)** — the dataset is gone from disk and from the index; no tracked file outside `tests/` reaches for it; no bundled dataset over 256 KB is tracked anywhere; the deployed client names no provider at all.
- **C (14)** — the primitive's whole behaviour: absent URL, whitespace URL, working URL, **failing** URL, no-loop, **recovery on a new URL**, no retry on the same bad URL, identical tile either way, announced as a picture, `decorative` silence, **unnamed card gets the empty tile**, no effect in the component, no fetch/URL/provider/persistence.
- **D (7)** — adoption at each of the four surfaces by class and props; no second card-`<img>` path in the deployed client; the shared plate is styled and clamped; door still 18, commands still 49, migration still `0013`.

Per the brief, the failure transition is exercised **once** against the real component plus adoption checked at each surface, rather than four near-identical render tests. The limits of that are in §9 ②.

**No unrelated pin was weakened.** The two dataset pins were restated to protect the property instead of the file; everything else is additive.

---

## 8. Full verification

| | |
|---|---|
| **Suites / tests** | **132 suites / 4,382 tests — ALL SUITES PASSED, 0 failed** |
| Prototype production build (`npm run prod`, → `dist/MetYet.prod.js`, **not deployed**) | `PRODUCTION BUILD OK — bytes: 345079` (unchanged) |
| Production smoke | `PROD SMOKE OK — rendered 83686 chars` (unchanged) |
| **Deployed client build** (`npm run build:app` → `app/`, what Render serves) | **299,510 bytes**, builds clean; needs `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` or `--allow-unconfigured`, as designed |
| Provider names in the deployed bundle | **0** |
| Newest migration | `0013_binders.sql` |
| Production command allow-list | **18** |
| Domain commands | **49** |
| Repository size | **−13.0 MB**; tracked tree now 9.9 MB |

Build outputs (`dist/`, `app/`, `site/`) are gitignored and none is staged.

```
 client/browse/CardBrowser.jsx                 |   8 +-
 client/card-art.jsx                           |  92 ++++++    (new)
 client/collector/CollectorShell.jsx           |  16 +-
 client/collector/sections/Binder.jsx          |   8 +-
 client/collector/sections/MyCards.jsx         |  22 +-
 client/collector/sections/TrustedPartners.jsx |   8 +-
 pokemon_cards.json                            |   1 -        (deleted, 13.6 MB)
 tests/all.cjs                                 |   2 +-
 tests/phase5-c4-catalog-import.cjs            |  82 +++++-
 tests/phase5-c5-tp-inventory-correction.cjs   |  11 +-
 tests/phase5-c71-catalog-hygiene.cjs          | 403 ++++++     (new)
 11 files changed, 614 insertions(+), 39 deletions(-)
```

---

## 9. Adversarial findings

The brief's fourteen questions were asked. Seven produced real defects, all in my own work, all fixed.

**① The correction reintroduced the same staleness, in a different spelling. [confirmed, fixed]**
My new suite asked "what did this batch change?" with `git diff d05f643` against the working tree, reasoning that a working-tree comparison gives the same answer before and after the commit and therefore cannot go falsely green. True — and beside the point. **The moment C7.1 merges, "changed since C7.1's base" means "changed since C7.1"**, so the next batch to touch `domain/` would have turned this suite red for a reason unrelated to C7.1. Demonstrated by rewinding the base one merge: `FAIL — the domain changed: domain/README.md`. It escaped my own new rule only because it is spelled without `HEAD`.
**Fix:** every base-relative assertion deleted. The suite now asserts only properties that should be permanently true — what the door holds, what is tracked, what the deployed client renders. **A batch-scoped question does not belong in a permanent test**, which is the general form of the lesson and a larger claim than the pin I was sent to fix.

**② The plate said "Loading this card…" in exactly the case it was built for. [confirmed, fixed]**
Three surfaces passed their row `title`, which for a card whose description has not arrived is the string `"Loading this card…"` (or `"A card"`, or `"A card that isn't in your catalogue"`). Since a card with no description also has no image, the tile added to say *which card this is* rendered a status line beside a title already saying it — permanently, if the description request failed, which is swallowed by design. Demonstrated by a real render with `onBrowseCards: null`: two plates, both `"Loading this card…"`.
**Fix:** the three now pass `known && known.cardName`, and the component renders an **empty tile** when it has no name. Four structurally-green adoption tests had not noticed, which is finding ⑦.

**③ The recovery reset committed one stale frame. [confirmed, fixed]**
`useEffect(() => setFailed(false), [src])` runs after commit, so a list re-sort that hands the instance a good URL paints one real frame of the fallback plate, plus `span`→`img` churn. My own test could not see it because `TR.act` flushes effects.
**Fix:** render-phase state adjustment; a test now pins that the component contains no effect at all.

**④ Two of three neutrality assertions on the new component could never fire. [confirmed, fixed]**
My `code()` helper strips comments, including everything after `//` — which turns `"https://images.pokemontcg.io/x"` into `"https:`. So the assertions forbidding a URL and forbidding a provider name were reading a file with the evidence already deleted. The one thing they were written to catch was the one thing they could not see.
**Fix:** those assertions read the raw file.

**⑤ The "no HEAD" rule caught one spelling of one call form. [confirmed, improved]**
Single quotes, `execSync` with a string, `base+"..HEAD"`, `rev-list`, a ref in a variable — all walked past, and it scanned only the top `tests/` directory. Broadened to every file under `tests/` recursively and every git subcommand that takes a range, permitting `git show HEAD:<path>`. **It remains a tripwire, not a proof, and the suite says so in its own comment** — a variable holding the ref defeats it and always will.

**⑥ The 34px plate clipped long names at both ends. [confirmed, fixed]**
Centred inside the tile with `overflow:hidden`, a name longer than ~28 characters lost half a line top *and* bottom — less readable than the empty box it replaced. **Fix:** `-webkit-line-clamp`, so it truncates at the end.

**⑦ The structural adoption check let a behavioural defect through. [confirmed, accepted with a named limit]**
It matches the first `<CardArt/>` per file and asserts on source text, so it could not see *what is passed as `name`* — which is how ② shipped with four green tests. All four surfaces do render it unconditionally, so there is no dead-conditional gap. The limit is real and stated: **adoption is checked structurally; behaviour is checked once, properly, against the real component.**

**Challenges accepted but not acted on** (all §12 debt): `git rm` does not remove the blob from history; the published demo site still hot-links the provider (§4); an in-flight or lazily-deferred image is still an ambiguous empty tile, since `onError` fires only on failure and there is no loading state or timeout; the frozen-range pin cannot run against a shallow CI clone.

**Checked and clean:** the deletion itself, re-traced independently — no build script, package script, harness, doc, `render.yaml` or workflow reads the file, and `npm run build` and `npm run previews` both succeed without it. Wrapper classes byte-identical at all four sites; no element dropped. `.mcs-group-plate` removal safe (its only occurrence at `d05f643` was its own declaration). Scope clean. `npm run ux:mobile-review:assert` fails — **and fails identically on a clean `d05f643` snapshot, so it is pre-existing and not this batch.**

---

## 10. Files changed

**Product (deployed client only):** `client/card-art.jsx` (new), `client/browse/CardBrowser.jsx`, `client/collector/sections/MyCards.jsx`, `client/collector/sections/TrustedPartners.jsx`, `client/collector/sections/Binder.jsx`, `client/collector/CollectorShell.jsx` (CSS).
**Removed:** `pokemon_cards.json`.
**Tests:** `tests/phase5-c71-catalog-hygiene.cjs` (new), `tests/phase5-c4-catalog-import.cjs`, `tests/phase5-c5-tp-inventory-correction.cjs`, `tests/all.cjs`.

---

## 11. Explicit confirmation

**No provider integration. No provider data imported. No provider SDK, credential, HTTP call or dependency added. No schema change. No migration. No domain change. No server change. No command or route change. No canonical identity change. No dataset substituted for the one removed. No pilot slice chosen. Nothing merged.**

Allow-list **18**, domain commands **49**, newest migration **`0013_binders.sql`** — all verified after the change, not assumed. The staged set is `client/`, `tests/`, and one deletion.

---

## 12. Remaining debt

1. **The published demo site hot-links `images.pokemontcg.io`.** `.github/workflows/deploy.yml` publishes a site built from `src/MetYet.jsx` (~50 hardcoded URLs) and `collector/MetYetCollector.jsx` (constructed at runtime). Same provider, same absent licence basis as the deleted file — still live, on every page view. Needs a founder decision (§13).
2. **The deleted blob is still in git history.** 13.6 MB, reachable at `d05f643:pokemon_cards.json`. If the reason for removing it is "no verified licence basis", deleting from `HEAD` does not fully discharge that. Rewriting history is out of scope and not free.
3. **No loading state.** `onError` fires only on failure; a request that stalls, or a `loading="lazy"` tile still off-screen, shows the ambiguous empty box the component's own header complains about. A loading state is a separate, larger change.
4. **CI cannot run the frozen-range pins on a shallow clone.** `actions/checkout@v4` defaults to `fetch-depth: 1`; the deploy workflow does not currently run tests, but any CI that does will throw rather than assert.
5. **`MetYet_Pilot_Readiness_Report.md` describes `pokemon_cards.json` as "0 bytes | Empty".** It was 13.6 MB. A pre-existing error in that audit, now moot, but it suggests that audit's file table was not measured.
6. **The "no HEAD" rule is a tripwire, not a proof.** A ref in a variable defeats it.

---

## 13. Smallest founder next action

**One decision: the published demo site's card images** (debt ①). It is the same question the deleted dataset raised, still live, and the options are small — leave it and record why, point the demo at its own images, or let the demo run on the name plates the prototype already renders when an image fails. It does not block the catalog work.

Then, unchanged from C7: **the next catalog decision comes from a real Trusted Partner's shelf**, compared against C7's measured coverage. Not from a TCGdex adapter, and not from this batch.

---

## 14. Amendment — published demo image hygiene

**Added after the first C7.1 hand-back, on the same branch. Same three-things discipline: remove one live dependency, let the demo degrade, guard the property.**

### Why this was requested

§4 above records what the first adversarial pass found: C7.1 deleted an unused dataset because MetYet has not established a usage basis for it, while **a published site kept making live requests to the same provider's image CDN on every page view.** The founder's answer was to close it rather than record it as debt.

### Proof the demo is published — the exact chain, reproduced before editing

| # | Link | Evidence |
|---|---|---|
| 1 | The workflow publishes on push to `main` | `.github/workflows/deploy.yml`: `on: push: branches: [main]`, `run: npm run build:site`, `upload-pages-artifact path: ./site`, `deploy-pages` |
| 2 | The site build reaches the prototype | `site.build.mjs` → `SRC = "site-src/main.jsx"` → `shell/MetYetPrototype.jsx` → `src/MetYet.jsx` **and** `collector/MetYetCollector.jsx` |
| 3 | Hardcoded URLs | `src/MetYet.jsx`: `CATALOG_IMAGES`, ~50 `[small, large]` pairs |
| 4 | Constructed URLs | `collector/MetYetCollector.jsx`: `artUrl(id)` → `` `https://images.pokemontcg.io/${set}/${num}_hires.png` `` |
| 5 | **The built, published artifact** | `npm run build:site` → `site/main.js`, **105 occurrences of `images.pokemontcg.io`**, served at `demo.metyet.io` (`site/CNAME`) |

Step 5 is the one that matters: not a source smell, a shipped artifact.

### What was removed

**`src/MetYet.jsx`** — the `CATALOG_IMAGES` table, the `catalogImage()` lookup, and the now-dead `CARD_IMAGE_SMALL_ASSET` constant. `CardImage` loses its image branch entirely.

**This cost one branch and no behaviour**, which is why it was cheap: `CardImage` already reserved the card's box and drew an identity plate whenever artwork was missing, slow or blocked. That path is now the only path. The `roomy` rule it already had is why a 34px tile shows a name and a 180px one shows set, number and grade as well.

**`collector/MetYetCollector.jsx`** — the `artUrl()` helper, and the middle term of the image chain. It was `actual || artUrl(card.csvId)`; it is now the Collector's own photograph or the plate.

**The Collector's own photographs stay.** They are MetYet's own data about a specific physical copy, they were always the preferred source, and their seed values (`copy:inv17:front`) are local references, not URLs.

**`csvId` stays on the seed records.** The brief said to retain it if it has a purpose beyond artwork. Honestly: it has no current reader at all — see the debt entry below.

### Before and after

| | Before | After |
|---|---|---|
| Published site | ~50 stock card images fetched from a third-party CDN | **no card artwork; every card is an identity plate** |
| Card identity | picture, with plate as fallback | plate — name always; set, number and grade at ≥54px |
| Layout | box reserved by `CardImage` | **identical box, same code path** — nothing moved |
| Collector's copy photos | rendered, preferred over stock | **unchanged** |
| `site/main.js` | 704,580 bytes, **105** provider references | 698,602 bytes, **0** |

### Tests restated and added

Seven test files, not the five the first pass estimated.

| File | What changed |
|---|---|
| `tests/collector.cjs` | "seeded goal cards render real images" → every goal resolves to something that names it; "URLs derive from csvId" → every catalog card carries the name its plate falls back to; failure test retargeted to a partner's shelf, where the remaining images are; **new**: no card image anywhere is remote |
| `tests/unified.cjs` | "artwork resolves from canonical csvId" → the Collector experience renders no remote card artwork |
| `tests/copy-photos.cjs` | "the actual front photo replaces the stock image" → the Collector's own photo is the **only** image a card can show |
| `tests/regression.cjs` | four drilldown sizing tests measured the `<img>`; they now measure the tile, which reserves the same box — the sizing discipline is the property, the element was the accident |
| `tests/phase5-c71-catalog-hygiene.cjs` | **new**: the published demo reaches no remote host but the ones it declares; plus a skip-if-absent check of the built site |

**The new guard inverts the rule.** Rather than forbidding one URL shape, it **walks the module graph from the entry `site.build.mjs` declares** and requires every remote reference in every file it reaches to be on a short declared allow-list (Google Fonts, the W3C SVG namespace, React's error-decoder link). A new host fails until somebody adds it there on purpose.

**Mutation-tested, eight ways:**

```
CAUGHT  "https://images.pokemontcg.io/base1/4.png"     (the original)
CAUGHT  "https://" + HOST + "/" + id + ".png"          (concatenated host)
CAUGHT  `//cdn.example.net/${id}.png`                  (protocol-relative, template literal)
CAUGHT  "//images.pokemontcg.io/base1/4.png"           (protocol-relative, literal)
CAUGHT  "https://art.example.org/x.svg"                (extension outside any list)
CAUGHT  "https://img.example.net/" + id                (host that is not "images.")
CAUGHT  import art from "https://esm.sh/card-art@1"    (CDN import)
CAUGHT  "https://r.example.io/render?card=x&fmt=png"   (query before extension)
CAUGHT  a provider URL planted in domain/metyet-store.js   (a module the first draft never scanned)
```

**What it still cannot see, stated rather than implied:** a host assembled from pieces at runtime, or hidden in base64. It is a tripwire for the shape somebody reaches for, not a proof.

### Adversarial findings on the amendment

A second pass found ten defects. **Four of them turned the full gate red**, which the amendment's own comment had claimed was impossible.

**① Two untouched suites broke, and I had written "NOTHING ELSE HAD TO CHANGE". [confirmed, fixed]**
`tests/regression.cjs` ×3 and `tests/copy-photos.cjs` ×1. The first measured card sizing by finding `<img class="cimg">`, which no longer exists; the second sliced the `Art` component to a fixed 900 characters and asserted `const src = actual || artUrl` — broken both by the rename and by my own new comment pushing the text past the window. **A fixed byte window into a source file is a pin that any comment can break.** The claim in `src/MetYet.jsx` has been corrected.

**② My headline new test was entirely vacuous. [confirmed, fixed]**
"no card image anywhere in the demo is a remote URL" looped over `findAllByType("img")` on three screens — all of which now render **zero** images. Both assertions never executed; it passed by asserting nothing. It also swallowed a failed `nav` in `try/catch`, so a renamed tab would have skipped every screen and still passed. Now it drives into a partner's shelf where images do render, counts what it examined, and fails if that count is zero.

**③ The same vacuum in `tests/unified.cjs`. [confirmed, fixed]** Now asserts the image count is zero explicitly, so the loop cannot pass by being empty and a future image is still checked.

**④ Two `regression.cjs` assertions went vacuous rather than red** — the aspect-ratio and ≤60px checks `forEach` over an empty set. They now assert the set is non-empty first.

**⑤ The guard was defeated 13 ways out of 14. [confirmed, fixed]** See the mutation table above; it now catches 8 of 8 tried, and names the two it cannot.

**⑥ The guard scanned a hand-written directory list while claiming to cover "every file the site entry reaches". [confirmed, fixed]** `src/MetYet.jsx` imports from `domain/` and `shared/`; both are bundled into the published site and neither was scanned. Proved by planting a provider URL in `domain/metyet-store.js` and watching the first draft pass. It now walks the real module graph.

**⑦ A comment in the file asserted the opposite of what the file asserts. [confirmed, fixed]** A C7.1 comment reading "the published demo site is built from `src/` and `collector/`, which **DO** hot-link a provider's CDN" survived forty lines above the new assertion that they do not.

**⑧ The built-site check is a no-op in CI, and now says so. [confirmed, documented]** `npm run verify` does not run `build:site`, and neither does the deploy workflow before publishing. It is skipped rather than failed when `site/` is absent, so the **source** assertion is the guard and the built-site check is belt and braces.

**⑨ `csvId` is now dead data, and my first draft added a test requiring it to stay. [confirmed, fixed]** Nothing in the application reads it. Pinning a field nothing reads is exactly the habit this batch exists to break, so the test now asserts what actually matters — every catalog card has a name for its plate — and the field is recorded as debt rather than protected.

**⑩ Cards are genuinely less distinguishable at the two smallest sizes. [confirmed, accepted]** `roomy` is `w >= 54`, so `thumbnail` (34px) and `triage` (52px) show the name alone. In the Opportunities drilldown eight rows now read "Charizard", where the picture used to separate Base Set from Shining from VMAX. `title` and `aria-label` still carry the full identity. This is a real cost of the amendment, it is the cost the brief accepted ("acceptable for the demo to be visually less rich"), and it is stated rather than glossed.

**Challenges accepted, not acted on:** the demo still loads Google Fonts, so the "published means live third-party requests" principle is applied to card artwork and not to a webfont — out of the amendment's scope, and named here rather than left implicit; dead CSS on the base `.cimg` rule; `regression.cjs`'s "Card display survives missing artwork" block is now named for a transition its component no longer has, though its plate assertions remain live.

**Checked and clean:** no hidden request survives — `site/` publishes exactly `main.js`, `index.html`, `CNAME`, `.nojekyll`, with no favicon, manifest, service worker, `<link rel=preload>`, OG image or CSS `url()`. No click or select handler was ever attached to the image branch. No artwork file of any kind entered the repository. History was not rewritten.

### Verification after the amendment — three builds, distinguished

| | |
|---|---|
| **Suites / tests** | **132 suites / 4,385 tests — ALL SUITES PASSED, 0 failed** |
| **1. Prototype production bundle** (`npm run prod` → `dist/MetYet.prod.js`, **deployed nowhere**) | **339,266 bytes** (was 345,079 — the removed table) |
| Production smoke | `PROD SMOKE OK — rendered 83686 chars` (unchanged) |
| **2. Render-deployed client** (`npm run build:app` → `app/`) | **300,169 bytes** |
| **3. GitHub Pages published demo** (`npm run build:site` → `site/`) | **698,602 bytes** (was 704,580) |
| Provider search against **all three built artifacts** | `pokemontcg\|tcgdex\|scrydex`: **0, 0, 0** |
| Every remote host in the published site | `http://www.w3.org` (SVG namespace), `https://fonts.googleapis.com` (stylesheet), `https://reactjs.org` (error decoder) — **no image host** |
| Newest migration / allow-list / domain commands | `0013_binders.sql` / **18** / **49** |

### Remaining provider references, after the amendment

| Where | Count | Class |
|---|---|---|
| **Application code (published or deployed)** | **0** | — |
| `tests/phase5-b5/b6/b7/b8/b81/c4`, `tests/collector.cjs`, `tests/unified.cjs`, `tests/phase5-c71-catalog-hygiene.cjs` | 16 lines | **test-only, protective** — they name providers in order to forbid them |
| `Claude outputs/*.md` | several | **historical reports**, deliberately not rewritten |

### Confirmation

**No replacement provider. No other CDN. No downloaded, copied, base64 or fabricated artwork. No image service. No provider abstraction or URL resolver. No artwork file entered the repository. No git history rewritten. No change to domain, server, routes, commands, schema or migrations.**

### Debt this amendment leaves

1. **`csvId` is dead data.** ~57 seed literals (`base1-4`, `swsh7-215`) that nothing reads. They are a set code and collector number — factual card identity, and the same convention several catalogues use — so they are not provider-proprietary, but they are unread. A later batch wiring canonical identity into the demo should either use them or drop them.
2. **The demo loads Google Fonts.** Same "published means live third-party requests" reasoning, different third party, out of scope here.
3. **Cards are less distinguishable at 34px and 52px** (finding ⑩).
4. **The guard is a tripwire, not a proof** — a runtime-assembled or base64 host defeats it.

---

## Hand-back

- **Branch:** `phase-5-c7-1-catalog-hygiene` (not merged)
- **Commits:** `e86e460` (C7.1) and the amendment commit — see the chat hand-back
- **Report:** `Claude outputs/MetYet_Phase5_C7_1_Catalog_Hygiene_Implementation_Report.md`
- **`pokemon_cards.json` removed:** yes — 13.6 MB, 32,599 records, entered in one "Add files via upload" commit and never modified; read by no build script, package script, harness, doc, workflow or runtime file; the deployed client and both prototype entry points get their images elsewhere. The two pins that asserted its continued existence now assert the property they were for.
- **Remaining `pokemontcg` references:** **zero in application code** after the §14 amendment. 16 lines across nine test files, all of which name providers in order to forbid them, plus the historical reports, which are deliberately not rewritten.
- **Published-demo dependency removed (§14):** `CATALOG_IMAGES` (~50 hardcoded `images.pokemontcg.io` pairs) from `src/MetYet.jsx` and `artUrl()` (runtime URL construction from `card.csvId`) from `collector/MetYetCollector.jsx` — both built into `site/main.js` and served at `demo.metyet.io`. The built site went from **105** provider references to **0**. Nothing replaced them.
- **Gate, after the §14 amendment:** **132 suites / 4,385 tests, ALL SUITES PASSED.** Three builds, distinguished: prototype `npm run prod` **339,266** bytes (deployed nowhere), Render client **300,169**, GitHub Pages demo **698,602** — **zero** provider references in all three. Smoke 83,686 chars, newest migration `0013_binders.sql`, allow-list 18, domain commands 49.
- **Push/PR:** *(see the chat hand-back)*
- **Founder decision required:** none outstanding. The demo's provider CDN links — the one decision the first hand-back asked for — were closed by the §14 amendment.

Stopping here.
