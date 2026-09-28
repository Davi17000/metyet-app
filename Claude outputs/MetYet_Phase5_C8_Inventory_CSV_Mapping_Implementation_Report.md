# MetYet — Phase 5 C8: Internal Inventory CSV Mapping + Reusable Templates

**Branch:** `phase-5-c8-inventory-csv-mapping` · **Base:** `242bbf507e6cc4607a7d51e404ff219842022305` (PR #74 / C7.1 merged)
**No migration. No new production command. No new HTTP route. No provider, network or artwork dependency.**

> **A note on how this batch was produced.** An adversarial pass over the finished implementation found **fourteen confirmed defects**, four of which let a bad row reach a shelf and one of which turned the full gate red. All are fixed, §11 records each one, and §8's `K.` section exists so none of them can come back quietly. The most useful finding was the sixteenth mutation: my first draft tested the CLI — **the only surface this batch has** — with source greps rather than behaviour, and a mutation making `--approve` default to `true` passed all 71 tests.

---

## 1. Baseline

Verified before editing, not assumed. `main` = `242bbf507e6cc4607a7d51e404ff219842022305`; **PR #74 is present** (`45c1687`, the amended C7.1, is its parent), so §0's stop condition did not fire.

| | Baseline | After C8 |
|---|---|---|
| Suites / tests | 132 / 4,385, **0 failures** | **133 / 4,481, 0 failures** |
| Prototype production build (`npm run prod`) | 339,266 bytes | **339,266** (unchanged) |
| Production smoke | 83,686 chars | **83,686** (unchanged) |
| Newest migration | `0013_binders.sql` | **`0013_binders.sql`** (none added) |
| Production command allow-list | 18 | **18** (unchanged) |
| Domain commands | 49 | **49** (unchanged) |

---

## 2. Repository findings that decided the design

Four facts from the repository overrode what the brief assumed, and each is load-bearing.

**① There is no operator UI, and that is a written rule rather than a gap.** `server/cli.js:340`: *"There is no HTTP route to this and there must never be: a browser cannot mint card identity, and a thirty-thousand-record import is not a request."* `client/production-app.jsx:89-113` serves exactly two seats and its default branch is a deliberate refusal. A search for `admin|operator|internal|staff` across `client/` returns four comments and no component. So the internal workflow is **CLI phases**, not a page — building a founder surface would mean inventing an admin boundary this codebase has declined.

**② No query existed that could answer "which canonical card is this?"** `findCardContexts` has **no `collectorNumber` parameter at all** (the column appears only in the SELECT and ORDER BY), matches card names by `like '%…%'`, caps at 100 rows, and returns contexts rather than printings. That is right for a person typing "zard" and useless for a spreadsheet row meaning one exact card.

**③ The grading vocabulary is far narrower than a real CSV.** `GRADED_VALUES` is `["Raw", "PSA 1" … "PSA 10"]` and `CONDITION_VALUES` is five exact strings. **`BGS 9.5`, `CGC 10`, `PSA 9.5` and `psa 9` are all inexpressible**, and `gradingProblem` rejects them before storage. This is a vocabulary ceiling, not a mapping problem.

**④ Money validates coerced and stores verbatim.** `addInventoryCopy` validates through `Number(...)` then spreads `...facts` unchanged, so `{ ask: "1150" }` passes and persists as a **string** that `client/tp/present.js:62` then renders as nothing at all. `Number("")` is 0 and `Number(true)` is 1, both accepted. Every one of those is a wrong number in the shape of a right one.

**⑤ `addInventoryCopy` does not whitelist its payload**, so any extra key lives on the row for ever and `updateInventoryCopy` has no way to name it. And it does **not** check that a canonical card is still active — that check lives in the HTTP route (`server/app.js:482` → `findSelectableCanonicalCard` → `card-unavailable`).

---

## 3. Architecture

```
CSV file ─▶ parseCsv ─▶ mapper.normalize ─▶ resolveIdentity ─▶ plan()  ──(operator reads)──▶ apply()
           (server/inventory/mapping.js)   (resolve.js)      (import.js)                   (import.js)
                    │                          │                                              │
            what does this SAY?        which card is it?                            addInventoryCopy
                                       (catalog read only)                          via executeCommands
```

**The seam the brief asked for is physical, not conventional.** `mapping.js` requires no database and cannot reach one — a test greps it for `fs.`, `db.`, `insert into` and `put*`. `resolve.js` takes a catalog and calls exactly one method on it, a read. Neither can mint identity. `import.js` is the only file that can write, and only through `apply()`.

**Where each piece lives, and why there.**

| | |
|---|---|
| `server/inventory/mapping.js` | The contract. CSV parsing, header folding, value vocabulary, per-row normalisation. Provider-neutral: it knows about a template, not a product. |
| `server/inventory/resolve.js` | The hard boundary. One normalized identity → one canonical card, or none, or too many. |
| `server/inventory/import.js` | `plan()` classifies and **takes no repository**; `apply()` is the only thing that writes. |
| `server/inventory/templates.js` | Configuration. Frozen objects, no table, no id, no version. |
| `persistence/catalog-repository.js` | **One new read**, `findCardIdentity`, keyed on the domain's own `cardContextNaturalKey`. |
| `persistence/command-transaction.js` | **`executeCommands`** — the batch sibling of `executeCommand`, in the same file, so there is no second write path. |
| `server/cli.js` | Three verbs. Two need no database at all. |

**`plan()` cannot write because it is not given anything to write with.** That is a signature, not a flag: a test asserts `plan`'s parameter list contains neither `repository` nor `runtime`. A boolean is one typo from a shelf nobody approved; a missing argument is a different kind of thing.

**§1's stop condition did not fire.** No new durable business concept (templates are frozen config), no second identity system (the lookup asks the catalog's own key), no migration.

---

## 4. The mapping contract

**Fields, split by what they describe** — because one side is resolved against the catalog and the other written onto a shelf row, and confusing them is how a copy's condition ends up in a card's identity:

- **Card identity:** `cardName`, `expansion`, `collectorNumber`, `language`, `printRun`, `finish`, `stamp`, `printVariation`
- **The physical copy:** `quantity`, `grade`, `condition`, `gradingCompany`, `numericGrade`, `cert`, `ask`, `cost`
- **Diagnostics only:** `sourceRowId`, `portfolio` — carried for a person reading a report, reaching no card and no copy. Tested.
- **Ignored:** any header, declared in the template's `ignore` list.

**What it normalises.** Headers fold across spacing, case and `_ - .` separators — and never across letters, so two genuinely different headers cannot collide (asserted). Values fold the same way for vocabulary lookup while the **original** is what a refusal quotes. Money reads `1150`, `1,150`, `1,150.00`, `$1,150`, `£1,150.00`, `0`, `0.50`. A grade arrives whole (`PSA 9`) or as a pair (`PSA` + `9`).

**What it refuses, by name, with the cell quoted back.** 12 reasons: `blank-identity`, `unknown-word`, `bad-number`, `bad-quantity`, `formula-cell`, `grading-incoherent`, `ungradeable-grade`, `two-values-for-one-field`, `duplicate-column`, `cert-without-grade`, `cert-for-many-copies`, `amount-too-large`, `amount-too-precise`, `quantity-too-large`.

**The four things it will not do**, each a tempting shortcut:

1. **It will not default a printing the file did not state.** Silence is recorded as silence: `{}`, not `{printRun: "not_applicable", finish: "non_holo", …}`. A test asserts the string `withDefaults` appears in neither `mapping.js` nor `resolve.js`. What silence *means* is the catalog's business (§6).
2. **It will not translate a word nobody declared.** An unknown foil, language or condition is refused with the value quoted.
3. **It will not flatten a grade MetYet cannot hold.** `BGS 9.5` → `ungradeable-grade`, with the reason *"MetYet holds Raw and PSA 1–10 and no other grade"*.
4. **It will not evaluate a cell.** A leading `=`, `+` or `@` where a fact belongs is refused, not parsed for a value behind it. `-5` is a negative number, not a formula, and is refused as a bad amount instead. Nothing in the layer contains `eval`, `new Function`, `child_process`, or a `require` of anything it was handed.

**A CSV is untrusted input.** No cell becomes a path, a key or a command; the mapping layer never touches the filesystem; the CLI parses its mapping file as JSON and never `require`s a path an operator passed.

---

## 5. Template representation

**Configuration, and nothing more.** `server/inventory/templates.js` exports frozen objects; `--template=<name>` picks one and `--mapping=<path>` takes a JSON file for a shape nobody has written down yet. No table, no migration, no aggregate, no id, no version — a test asserts the module contains no `db.`, `insert into`, `select ` or `repository`.

Two ship: **`collectr-provisional`** and **`custom-spreadsheet`**. Adding "Card Ladder" or "Justin — Card Ladder" later is an entry in that file; it touches no model, no schema and no command, which is the property worth protecting.

**A template cannot outvote the domain.** `checkTemplate` asks `domain/card-identity.js` and `domain/metyet-domain.js` about **every** translation when the mapper is built, so a sixth print run, a `PSA 9.5` or a `Pristine` condition written down there is a **startup error**, not a wrong copy found later. It also refuses two fields mapped to one header, a header both mapped and ignored, an unknown field name, and vocabulary on a field that takes none.

**One thing the review caught here and it was the sharpest finding of the pass.** My first draft's shared vocabulary mapped `n/a`, `na` and `standard` → `not_applicable`, and `none`/`no` → `non_holo`. `not_applicable` is a **positive claim about a release**, so three spellings of *"I didn't write it down"* were importing a confident print-run assertion while the honest blank cell was correctly reported as ambiguous — the exact default the design swears it never invents, smuggled back through configuration. Removed. `no` survives in a `Foil` column because "no" answering "is it foil?" is an answer; `none` does not, because in that column it reads as absence.

**And a second.** `CONDITION_WORDS` mapped `Mint`→Near Mint, `Excellent`→Lightly Played, `Good`→Moderately Played, `Poor`→Heavily Played. Those are **re-grades, not translations**, and they are wrong in money. Only abbreviations of MetYet's own words remain.

---

## 6. Canonical resolution — the hard boundary

**One new read**, `findCardIdentity({ game, expansionCode, collectorNumber, cardName })`, keyed on `cardContextNaturalKey` — so it folds the card name and does **not** fold the collector number, exactly as the write does. An importer matching on the `card_name` column would disagree with `putCardContext` about capitalisation; a test pins both halves (`cHaRiZaRd` resolves, `04` does not match `4`). It is read-only, takes no world lock, returns **every** candidate and chooses nothing.

**Four outcomes, and the third is the one that matters.**

| outcome | when | what happens |
|---|---|---|
| **resolved** | exactly one active canonical card | eligible for import |
| **unresolved** | `no-such-expansion`, `no-such-card`, `no-such-printing` | no import; the reason says which, and shows the printings MetYet *does* hold |
| **ambiguous** | `many-cards-one-number` (a discriminator collision a CSV cannot carry), `many-printings` | **nothing is chosen.** All candidates are offered and the reason names the dimensions the file left silent |
| **invalid** | refused by the mapper before the catalog was asked | no import |

**The one real judgement, and it is the crux of the brief.** A row that names no printing has not said *"the ordinary printing"*. If the card has **one** active printing, silence cannot be wrong and the row resolves. If it has **several**, silence is an ambiguity and is reported as one. That is why nothing calls `withDefaults` on a source row: defaulting turns "the file did not say" into a five-part assertion nobody made.

**A withdrawn printing is not a candidate**, matching `readCardContext` and `findSelectableCanonicalCard` — and it is re-checked at write time (§7).

**A set name instead of a code** is the likeliest real-world failure, so `no-such-expansion` now looks once by name and says *"did the file mean BASE1 (Base Set)? MetYet matches releases by CODE"* — as a suggestion, never a match.

---

## 7. Import semantics

**The existing command, the existing invariants.** Every row goes through `addInventoryCopy` with the caller's `partnerId`. A test asserts `import.js` contains no `insert into`, no `saveWorld` and no `db.transaction`, and proves the invariants still bite by handing the command a raw copy with no condition and watching the whole batch fail with `grading-incoherent`.

**One transaction for the batch.** `executeCommands` lives beside `executeCommand` in `persistence/command-transaction.js` — putting the fold in `server/inventory/` would *be* the second write path the brief forbids. It takes the same world lock, reads the version once, folds `C.execute` over the accumulating state, validates once, saves with `expectedVersion`, and bumps the version exactly once. **Any refusal rolls the whole batch back** and reports the file line that caused it. A database fault mid-batch leaves nothing behind (tested by breaking `saveWorld`).

**Quantity expands to that many copies**, because MetYet's model is one row per physical copy — three copies are three things a shop can price, photograph and sell separately.

| behaviour | what happens |
|---|---|
| quantity > 1 | N separate copies, distinct `invId`s |
| **quantity > 1 with a cert** | **refused** — a certificate identifies one slab (§11 ③) |
| repeated identical rows | each becomes its own copy; the plan reports how many the shelf already holds |
| **re-running the same CSV** | **duplicates, deliberately.** See below. |
| partial valid/invalid file | valid rows import, invalid ones are reported; nothing is dropped |
| raw vs graded | the domain's rule, asked in the **preview** so a founder sees it before a refusal code |
| ask/cost | coerced to a real JS number, bounded, at most two decimal places |
| blanks | absence, which is a different thing from zero — both are preserved |
| archived inventory | not counted as already held |
| DB failure | all or nothing |

**Idempotency is not invented.** An inventory copy has no natural key and `invId` is minted fresh per write, so importing the same file twice puts the same cards on the shelf twice. MetYet has not decided what a source row's durable identity is, and deciding it in a corner of an import runner would be the wrong place. So the plan **says**, before the write, how many copies of each card the shelf already holds, and the report adds *"importing adds MORE copies; there is no de-duplication"*. An operator's decision, visible in advance.

**Two caps**, because "finite" is not a bound: **500 copies per row** and **2,000 per run**. One mistyped `Qty` cell would otherwise hold the world lock while it materialised 50,000 rows.

---

## 8. Authorisation, security, and the internal workflow

**The partner comes from `--partner`, never from the file.** No CSV column can name one; `portfolio` is a diagnostic. A plan made for one shop **cannot** be applied to another — `apply()` refuses a `partnerId` that differs from the plan's. A Collector applying a plan is refused by the command's own seat check. There is no HTTP route, so there is no anonymous caller: a test asserts `server/app.js` mentions no inventory-import route and that no client file requires the runner.

**The workflow, as three invocations:**

```
node server/cli.js inventory-templates                        # what shapes MetYet knows
node server/cli.js inventory-columns --csv=… --template=…     # what this file's headers became
node server/cli.js inventory-import --partner=p1 --csv=… --template=…            # preview
node server/cli.js inventory-import --partner=p1 --csv=… --template=… --approve  # import
```

`inventory-templates` and `inventory-columns` are in `WITHOUT_DATABASE` — a verb that cannot write is not handed a database to write with, and neither needs `DATABASE_URL`.

**`--approve` rather than `--dry-run`.** `catalog-import` defaults to writing because its input is a vocabulary MetYet owns. This input is somebody else's and the mapping is a guess until a person has read a preview, so the default is the safe one and the dangerous one must be asked for. `--approve=yes` and `--approve=0` both **preview** — a flag that quietly previews beats one that quietly writes, and which way that ambiguity falls is pinned.

**Exit codes:** `0` clean, `1` failure, `2` invalid invocation, `3` previewed or imported but something did not resolve — which, with a thin catalog, is the expected answer rather than a fault.

**The report prints counts for what worked and quotes only what did not.** A successful import prints no card name, no price and no certificate number; the rejected list is capped at 20 lines and each carries a line number an operator can look up. (An earlier draft's comment claimed no detail was ever printed, which was false of the line directly beneath it — §11 ⑨.)

**Line numbers are the file's**, counted by the parser where the newlines are — not the row's position, which drifts the moment a blank separator row or a quoted newline appears (§11 ⑤).

---

## 9. The provisional Collectr fixture

`tests/fixtures/collectr-provisional.csv`, 22 rows, **15 of which are meant to fail.**

**It is declared synthetic in three places** — the file's own README, the template's `note`, and the `provisional: true` flag that travels into every report that names the template. The README says plainly: *"This is not a Collectr export… The headers are a guess… nothing was scraped."* A test asserts all three.

No Collectr-specific behaviour is encoded anywhere. The template is column names and word translations; if the real export is shaped differently, the template changes and nothing else does. That is what the fixture exists to prove.

**Justin's real export is the adversarial specimen.** It should be run against this contract *as it is*, not cleaned to fit. What it breaks is the finding.

---

## 10. Tests and mutations

**96 tests in 11 sections** (`tests/phase5-c8-inventory-csv-mapping.cjs`), registered in `tests/all.cjs`.

| | section | n |
|---|---|---|
| A | the file is read as a file, and a cell is only ever data | 8 |
| B | a template is configuration, and cannot outvote the domain | 6 |
| C | what a row says, and what it cannot be made to say | 16 |
| D | one card, no card, or too many — and never a guess | 11 |
| E | a preview classifies everything and writes nothing | 7 |
| F | importing goes through the shelf's own door | 9 |
| G | whose shelf this is | 5 |
| H | no provider, no network, no artwork | 4 |
| I | and nothing else moved | 5 |
| J | **the operator's door** | 13 |
| K | **the ways a bad row used to get in** | 12 |

All eighteen of the brief's required pins are covered. `J` exists because the first draft had none and mutation 16 survived because of it; `K` is one test per defect the review found.

### Mutation testing — 21 dangerous mutations, all caught

Each was applied to the real source, the suite run, and the file restored.

```
CAUGHT  an unresolved row becomes importable            CAUGHT  --approve DEFAULTS TO TRUE
CAUGHT  ambiguity picks the first candidate             CAUGHT  exitCodeForPlan always returns 0
CAUGHT  blank identity is sufficient                    CAUGHT  the --template/--mapping guard is dropped
CAUGHT  nonsense money becomes zero                     CAUGHT  the duplicate-run warning is dropped
CAUGHT  silence becomes the ordinary printing           CAUGHT  withdrawn cards import again
CAUGHT  a plan applies to any partner                   CAUGHT  the payload whitelist is dropped
CAUGHT  plan() is handed a repository                   CAUGHT  a cert rides on an ungraded card
CAUGHT  an unknown variant word is coerced              CAUGHT  one cert across many copies
CAUGHT  BGS becomes the nearest PSA number              CAUGHT  money loses its bound
CAUGHT  per-row transactions (half batch possible)      CAUGHT  line numbers revert to row position
CAUGHT  a bad quantity becomes one                      CAUGHT  duplicate columns last-wins again
CAUGHT  rejected rows are dropped                       CAUGHT  the lying-read check reverts to continue
CAUGHT  a template invents a word                       CAUGHT  templates translate N/A into a print run
CAUGHT  a formula is parsed for a value                 CAUGHT  templates re-grade Mint to Near Mint
CAUGHT  a provider URL enters the layer                 CAUGHT  the run cap is dropped
CAUGHT  the set-name hint is dropped
```

**Worth being precise about one of them.** My first attempt at "exitCodeForPlan always clean" was `EXIT.clean || (…)` — and `EXIT.clean` is `0`, which is falsy, so the mutation was a no-op that I nearly recorded as a survivor. Re-done properly, it is caught.

---

## 11. Defects found and fixed

Fourteen confirmed, all mine, found by an adversarial pass over the finished implementation.

**① The branch did not pass its own gate.** Two pre-existing pins caught prose I wrote: the C4 suite forbids the CLI printing a counter under a particular label (C4 had one nothing could compute honestly) and my column report used it; `tests/phase3-registration.cjs` forbids show/marketplace framing and my usage text said "shows which rows". **Fixed by changing my words, not the pins** — the label is now `unread:` and the sentence says "reports".

**② A WITHDRAWN canonical card imported, so this write path was strictly weaker than the screen it claimed to reuse.** `addInventoryCopy` only looks a card up when the payload has **no** canonical id; the active-status check lives in the HTTP route. A printing withdrawn between preview and approval landed on a shelf, while `import.js`'s own header claimed *"nothing here relaxes a check"*. **Fixed:** `apply()` re-checks `findSelectableCanonicalCard` per row at write time and refuses `card-unavailable` — the same answer the screen gives, now asserted side by side.

**③ Quantity > 1 with a certificate number wrote N copies all claiming one PSA certification.** Reproduced with the shipped fixture: two rows, both `cert 70551202`. A cert identifies one slab, so two of those were a fabricated certification on a real card. **Fixed:** refused as `cert-for-many-copies`, and the fixture now has a row that exercises it.

**④ A certificate number persisted on a Raw card and on a card with no grade at all.** `gradingProblem` never looks at `cert`, so the domain took it. **Fixed:** a cert requires a grade, and not `Raw`.

**⑤ Reported line numbers were wrong after any blank row or wrapped cell** — silently, in a report whose entire content is line numbers. **Fixed:** the parser counts true lines and carries them beside each row; a test builds a file with both and checks the number.

**⑥ Two columns for one field silently took the rightmost.** `checkTemplate` throws on the mirror case (two fields → one header) as *"a claim nobody could check"*; the file's version was the same claim, accepted quietly. **Fixed:** reported as `duplicate-column` and the row refused.

**⑦ The templates smuggled back the default `resolve.js` swears it never invents** — see §5.

**⑧ `CONDITION_WORDS` silently re-graded cards** — see §5.

**⑨ `reportPlan`'s comment was false in the two lines below it**, claiming no card name or price is ever printed. **Fixed:** the comment now says what the code does and why the rejected rows are quoted while the imported ones are not.

**⑩ Money was unbounded and imprecise.** `"11111111111111111111"` came back as `11111111111111110000` — different digits from the ones written. **Fixed:** bounded to one billion and to values that survive `Number.isSafeInteger(amount × 100)`, with more than two decimal places refused as `amount-too-precise`. (The dead `amount < 0` branch is gone; the regex admits no sign.)

**⑪ The sixteenth mutation survived: the CLI had no behavioural test.** 223 lines of the only surface this batch has, checked with source greps. `--approve = true` passed all 71 tests — the single most dangerous change possible, and the thing the verb's own comment calls *"one typo away from a shelf nobody agreed to"*. **Fixed:** section `J`, 13 tests driving `runCommand` with an injected database, as C4 does for its own verb.

**⑫ `findCardIdentity`'s silent `continue` answered a lying read with false certainty.** A context row whose natural key contradicts its own columns was dropped without a word — which could collapse a genuine ambiguity into a confident single match. **Fixed:** it throws. If the folding rule ever changes it becomes reachable for every old row at once, and a caller that cannot be answered correctly must not be answered at all.

**⑬ `executeCommands`' justification for validating once was factually wrong.** It claimed *"every intermediate state was produced by a command that already validated its own change"*; `C.execute` never calls `validateWorld`. **Fixed:** the comment now gives the true and narrower reason — only the final state is persisted and a refusal rolls the batch back, so an intermediate state is never durable.

**⑭ No bound on batch size, and `--limit` bounded rows but not copies** — see §7.

**Also fixed from the challenges:** `apply()` now whitelists the payload (`addInventoryCopy` spreads whatever it is handed, and `updateInventoryCopy` cannot name a field it does not know); `findCardIdentity` no longer throws on an unknown game; the fixture README's accounting was wrong in three ways and is corrected.

---

## 12. Verification

| | |
|---|---|
| **Suites / tests** | **133 suites / 4,481 tests — ALL SUITES PASSED, 0 failed** |
| Prototype production build | `PRODUCTION BUILD OK — bytes: 339266` (unchanged) |
| Production smoke | `PROD SMOKE OK — rendered 83686 chars` (unchanged) |
| Newest migration | `0013_binders.sql` — **no migration added** |
| Production command allow-list | **18** — unchanged |
| Domain commands | **49** — unchanged |
| Provider / network references added | **0** — asserted per file, plus no CSV or provider library in `package.json` |
| Dependencies added | **0** |
| Files changed | 11 (7 new, 4 modified) · **+3,273 / −3** |

Nothing under `domain/` changed. No historical pin was weakened; two caught me and I changed my code.

```
 persistence/catalog-repository.js         |  101 +     (one read-only method)
 persistence/command-transaction.js        |   81 +     (executeCommands)
 server/cli.js                             |  237 +     (three verbs)
 server/inventory/import.js                |  245 +     new
 server/inventory/mapping.js               |  601 +     new
 server/inventory/resolve.js               |  137 +     new
 server/inventory/templates.js             |  237 +     new
 tests/all.cjs                             |    2 +-
 tests/fixtures/README.md                  |   49 +     new
 tests/fixtures/collectr-provisional.csv   |   23 +     new
 tests/phase5-c8-inventory-csv-mapping.cjs | 1563 +     new
```

---

## 13. Deferred debt, and what a real CSV will hit

**The stop condition is met** — but this is the honest list of what a first real file will do that this does not handle, measured rather than guessed.

| input | what happens today |
|---|---|
| **a set NAME (`Base Set`) not a code (`BASE1`)** | unresolved, **now with a suggestion naming the code** — but still every row. The likeliest real failure. |
| a semicolon-delimited Excel export | one header, every row `blank-identity`. No delimiter sniffing, and no hint that the delimiter is the problem. |
| a UTF-16 export ("Unicode Text") | read as UTF-8; headers arrive with NUL bytes and no diagnosis. |
| a preamble line above the header | the real header row is imported as a data row. |
| `Qty` of `1.0` | `bad-quantity` — correct, but a whole column of `1.0` fails a whole file. |
| a separate `Currency` column | unmapped and ignored. **There is no currency field anywhere in the contract**, so USD and JPY land in one untagged `ask`. |
| Japanese cards | `ja` maps, but Japanese set codes and names will miss on exact matching. |
| sealed product, bulk lots | no concept; each becomes `no-such-card` with no way to say "this is not a single card". |
| a 50,000-row file | the whole file is read into one string and the whole plan into memory; capped at 2,000 copies per run, so it must be split. |
| **a Turkish dotted İ in a card name** | `lower()` in Postgres and `.toLowerCase()` in JS disagree; permanently unresolvable with a reason that is a lie. |

**Named debt, in order of what I would fix first:**

1. **Expansion matching by name**, not only code — the suggestion is a signpost, not a fix.
2. **A currency field**, or a documented single-currency assumption.
3. **Idempotency**: MetYet has no durable identity for an inventory copy. Until it does, re-runs duplicate and the warning is all there is.
4. **Delimiter and encoding detection**, or at least a diagnosis instead of a wall of `blank-identity`.
5. **A spent plan can be applied twice** — `apply()` checks `written !== false` but never sets it. The duplicate warning covers it; the flag should still be set.
6. `findCardIdentity` runs one query per matching context (N+1), bounded only by how often a release reuses a number and a name.
7. **PSA-only grading** is a domain ceiling, not a mapping gap. A shop with BGS or CGC inventory cannot be onboarded at all, and that is a product decision rather than a bug.

---

## 14. Hand-back

- **Branch:** `phase-5-c8-inventory-csv-mapping`, not merged
- **Base:** `242bbf507e6cc4607a7d51e404ff219842022305`
- **Report:** `Claude outputs/MetYet_Phase5_C8_Inventory_CSV_Mapping_Implementation_Report.md`
- **Gate:** **133 suites / 4,481 tests, ALL SUITES PASSED.** Build 339,266 bytes, smoke 83,686 chars, newest migration `0013_binders.sql`, allow-list **18**, domain commands **49**.
- **No migration. No production command. No HTTP route. No domain change. No provider, network, artwork or dependency added.**
- **What is proven:** MetYet can take a differently-shaped TP inventory CSV, map its columns into one provider-neutral contract, resolve each row against the existing canonical catalog, show the founder which rows can and cannot be imported and why, and safely import only approved resolvable rows through the existing TP inventory model. 21 dangerous mutations were applied and all 21 were caught.
- **What remains unknown until Justin's real CSV arrives:** its delimiter, its encoding, whether it names sets by code or by name, whether it carries a currency column, whether its grades are PSA-only, whether it includes sealed product, and whether its headers resemble the provisional template at all. **The fixture proves the contract; it does not predict the file.** Run the real export against this as it stands.

Stopping here.
