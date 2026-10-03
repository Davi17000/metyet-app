# MetYet — CollectorCopy Disposition Is an Explicit Choice — Batch 2 Hand-Back

**Branch:** `phase-5-four-state` · **not merged** · worktree clean · Binder batch not begun.

**Stop condition met.** A new durable `CollectorCopy` cannot exist without being exactly PC or Trade/Sell; no supported command returns one to statelessness; the switch is atomic in both directions; every copy recorded before the rule still loads and is never assigned a disposition by inference; and no new grade, condition, cert, photograph, Binder, transaction or persistence requirement was added.

**Read §19 and §10 first.** The gate took two attempts — the first left the defect alive in a narrower form — and three files outside the expected surface changed, two of them because the adversarial pass found tests that had quietly stopped testing anything.

---

## 1–3. SHAs

| | |
|---|---|
| Starting | `78ebb8d` (Batch 2 audit) |
| Implementation | **`8d1840a`** |
| Docs | this document, committed separately |
| Merged to `main` | No |

---

## 4. Files changed

```
 client/collector/CardSpecification.jsx            | 116 ++-
 client/commands.js                                |  13 +-
 collector/MetYetCollector.jsx                     |   6 +-
 domain/README.md                                  |  24 +-
 domain/metyet-commands.js                         | 132 +++-
 domain/metyet-domain.js                           |  20 +
 tests/all.cjs                                     |   2 +-
 tests/phase3-domain-readiness.cjs                 |  36 +-
 tests/phase5-c2-collector-copy.cjs                |  98 ++-
 tests/phase5-c21-collector-copy-corrections.cjs   |  44 +-
 tests/phase5-c31-binder-foundation.cjs            |  14 +-
 tests/phase5-c32-goal-criteria-grading.cjs        |  20 +-
 tests/phase5-c33-card-specification.cjs           |  51 +-
 tests/phase5-c34a-your-cards.cjs                  |  25 +-
 tests/phase5-c34b-binder.cjs                      |  19 +-
 tests/phase5-c35-close-the-loop.cjs               |  10 +-
 tests/phase5-c4-catalog-import.cjs                |   6 +-
 tests/phase5-c5-tp-inventory-correction.cjs       |  12 +-
 tests/phase5-collector-identity-stabilization.cjs |  23 +-
 tests/phase5-copy-disposition-explicit-choice.cjs | 857 ++++++++++++++++++++++
 tests/phase5-four-state-and-binder-invariant.cjs  | 173 ++++-
 21 files changed, 1521 insertions(+), 180 deletions(-)
```

Four source files, one new suite, its registration, thirteen re-pinned suites, one README, one prototype comment. The audit predicted the first four exactly; §19 explains the other three.

---

## 5. `invalid-disposition`

One new code, `invalidDisposition: "invalid-disposition"`, in `domain/metyet-domain.js` beside `invalidTier`. Named for `invalid-tier` and through it for `invalid-amount`: *the request named something the domain has no value for.*

It answers three sites with one sentence:

| Site | Refused when |
|---|---|
| `addCollectorCopy` | neither flag is `true`, or either flag is present and not a boolean |
| `setCollectorCopyOffered` | `offered` is anything but `true` |
| `setCollectorCopyKept` | `keeping` is anything but `true` |

**`disposition-conflict` is untouched** and keeps its own meaning — both flags `true`. The two answer opposite failures and must not collapse: one means "you said both", the other "you said neither". A caller told the wrong one looks at the wrong half of its payload. Test `[4]` of the new suite pins that they are different codes.

**On the setters it replaces `not-found`**, which previously answered a non-boolean and so told a caller its copy did not exist when the copy was fine. A copy that really is missing still answers `not-found`, including when the argument is also wrong — pinned by `[12]`.

Collector-facing sentence, in `CardSpecification.jsx`'s `WHY` map: *"A copy has to say whether you'd part with it or you're keeping it."*

---

## 6. Creation contract, before and after

| Payload | Before | After |
|---|---|---|
| `{ offered: true }` | Trade/Sell, 200 | **unchanged** |
| `{ keeping: true }` | PC, 200 | **unchanged** |
| `{ offered: true, keeping: false }` | Trade/Sell, no `keeping` key | **unchanged** — this is what the panel sends |
| `{ offered: false, keeping: true }` | PC | **unchanged** — the panel's other payload |
| `{ offered: true, keeping: true }` | `disposition-conflict` | **unchanged** |
| key omitted / both omitted | **stateless copy, 200** | `invalid-disposition`, nothing written |
| `{ offered: false }` / `{ keeping: false }` / both `false` | **stateless copy, 200** | `invalid-disposition` |
| `{ offered: null }`, `{ keeping: null }` | **stateless copy, 200** | `invalid-disposition` |
| `{ offered: "yes" }`, `{ keeping: 1 }`, `[]`, `{}` | **stateless copy, 200** | `invalid-disposition` |
| `{ offered: "yes", keeping: true }` | **PC, 200 — the offer silently discarded** | `invalid-disposition` |

**The last row is the second attempt, and it matters.** My first gate was `!(offered === true) && !(keeping === true)`, which fires only when *both* flags fail. So `{ offered: "yes", keeping: true }` was accepted, the `"yes"` coerced to `false`, and somebody trying to offer a card got a PC copy with a 200 — the original defect, narrowed rather than removed, and in direct contradiction of the comment I had just written about one field answering two ways at two boundaries. The adversarial pass caught it. The gate is now two checks: a present-but-not-boolean flag is refused first, then the XOR. `false` on the *other* flag stays legal, because `{ offered: true, keeping: false }` is a complete, unambiguous answer and is what production sends on every new copy.

**Placement:** one line below the `disposition-conflict` check and above `ctx.id("b", askedId)`, which advances the runtime's id sequence the moment it is called. **No refusal about a disposition consumes a copy id** — pinned by `[6]` with a counting runtime. (`copy-in-use` sits after the mint and would consume one; it answers a collision with an id the runtime has just minted and is unreachable in practice. The comment and the test both say so rather than claiming otherwise — a claim I had to correct, see §19.)

**Storage is unchanged.** Still two booleans in `attrs`; `keeping` still written only for `true`, never as `false`; no enum, no migration.

---

## 7. Setter contract, before and after

| Call | Before | After |
|---|---|---|
| `setCollectorCopyOffered(id, true)` | offers; clears any keep | **unchanged** |
| `setCollectorCopyKept(id, true)` | keeps; clears the offer | **unchanged** |
| re-stating the answer a copy has | silent no-op, writes nothing | **unchanged** (`[13]`) |
| `setCollectorCopyOffered(id, false)` | **200, copy returns to saying nothing** | `invalid-disposition`, nothing written |
| `setCollectorCopyKept(id, false)` | **200, copy returns to saying nothing** | `invalid-disposition`, nothing written |
| non-boolean | `not-found` | `invalid-disposition` |
| no such copy | `not-found` | **unchanged** |

**Two dead branches removed.** `withDisposition(b, offered, offered ? false : D.copyKept(b), at)` preserved an existing keep *through a withdrawal*; its mirror did the same for an offer. Withdrawal is refused, so both branches were unreachable, and code that implies a reachable path is a lie about what the command can do. They now read `withDisposition(b, true, false, at)` and `withDisposition(b, false, true, at)`. The idempotence guards lost the same conjunct for the same reason.

**The switch is atomic in both directions**, and `keeping: false` is still never stored — `withDisposition` removes the key rather than writing it. Pinned by `[8]`, `[9]`, `[14]`, and in the four-state suite by the re-pinned `[31]`.

---

## 8. CardSpecification

| | Before | After |
|---|---|---|
| Choices offered | three: Trade/Sell, PC, **"Haven't decided"** | two |
| A new copy's draft | `"unstated"` pre-selected (the third button) | **neither pressed** |
| Save with an unanswered new copy | **enabled, into a guaranteed refusal** | disabled, with the reason shown |
| Plan for an unanswered new copy | `record-copy` with `{offered:false, keeping:false}` | **no step at all** |
| Switching an existing copy | one positive step (already) | **unchanged** |
| Ending an offer | `withdrawals.push({ offered: false })` | the branch is gone with the button |
| An existing copy stored saying nothing | opened as `"unstated"` | opens with **neither pressed**, and stays that way |
| Draft sentinel | `"unstated"` | **`"unanswered"`** |

**`planFrom` emitting nothing for an unanswered draft is a second attempt too.** My first version left the local check as the only guard, so the exported pure function still composed the payload the domain refuses — the invariant lived in one `if` in the view rather than in the thing that decides what gets sent. It now cannot express the refused shape. Both halves are bitten (`[17]`, `[19b]`).

**The rename is not cosmetic.** `"unstated"` already meant two other things: `D.copyDisposition` returns it for a copy really stored saying nothing, and `gradingOf(copy).state` returns it for a copy whose *grade* nobody stated. One word across three layers is how a reader comes to believe a draft and a durable record are the same kind of claim. `D.copyDisposition` keeps its value — it reads real data — and grading's is untouched; only the panel's draft word moved.

**An existing undecided copy is never forced.** `asDraft` maps it to the sentinel, `planFrom` compares sentinel to sentinel and emits nothing, and `localProblem` requires an answer only when `!draft.id`. Correcting such a copy's market value sends exactly one `correct-copy` step and leaves the disposition alone — pinned through the mounted component (`[20]`) and through the real `planFrom` (`[21]`).

`client/commands.js`: `addOwnedCopy` no longer defaults `offered = false, keeping = false`. A default that now guarantees a refusal is worse than none — the omission would surface as a server refusal instead of as `undefined` at the call site that caused it. The physical facts keep their `null` defaults, because absent is a true answer for each of them.

---

## 9. Stateless-copy compatibility

Every item the brief listed, verified by test, in section D of the new suite:

| | Pinned by |
|---|---|
| loads and passes `validateWorld` | `[23]` — and it also asserts the validator did **not** acquire the rule |
| renders under current semantics; owner still sees it | `[24]` |
| partner visibility unchanged — the row does not cross | `[24]` |
| grade / condition / cert / market still editable | `[25]`, and the patch door still refuses the disposition itself |
| Binder filing and unfiling unchanged | `[26]` |
| still barred from a trade package by the existing rule | `[27]` (`copy-not-offered`), and `setInterest` still `not-found` |
| removable when otherwise allowed | `[28]` |
| resolves to PC via `setCollectorCopyKept(true)` | `[28]` |
| resolves to Trade/Sell via `setCollectorCopyOffered(true)` | `[28]` |
| nothing resolves one on its own, through a sequence of surfaces | `[29]` |

**No migration, no backfill, no inference.** `domain/metyet-world.js` is untouched — `git diff` confirms — and `persistence/migrations/` is unchanged at 13 files, latest still `0013_binders.sql`.

The audit's finding stands and is worth repeating: these copies are not a historical remnant. Migration 0012 backfilled every pre-C2 row to `offered: true`, so the undecided population was being created *continuously* by `addOwnedCopy`'s defaults, by the "Haven't decided" button and by every withdrawal. **This batch closes all three sources.** The set is now finite and shrinking, which is what makes a later hard invariant reachable without a migration that invents intent.

---

## 10. Test re-pinning

**131 assertions failed across 12 suites from the two gates** (the audit measured 121 from creation alone). Thirteen suites were edited in the end. None was mass-edited to green; each was read and decided.

| Suite | Treatment |
|---|---|
| `phase3-domain-readiness` | **one transcript call**, which recovered 66 assertions. The copy is now born PC so each switch after it is real work rather than a no-op (the "stamps the runtime's time" assertions need a write to look at), and the `setCollectorCopyKept(false)` step — whose comment demonstrated that withdrawing a keep does not restore the offer — is removed with that asymmetry re-homed to the new suite |
| `phase5-c2` | the suite's own claims re-pinned by hand (below), plus a guarded scaffolding default and `keep()` replacing every withdrawal |
| `phase5-c21` | `keep()` throughout section C; two named claims re-pinned (below) |
| `phase5-c31` | test F's three copies each say what they mean; its earlier re-pin note corrected |
| `phase5-c32`, `c33`, `c34a`, `c34b` | guarded scaffolding defaults, plus per-call dispositions in the tests that are *about* the disposition |
| `phase5-c4`, `c5` | per-call dispositions; c5's "a copy kept back" now actually says PC, which it never did |
| `phase5-collector-identity-stabilization` | `[3]` seeds the silent copy instead of commanding one |
| `phase5-four-state-and-binder-invariant` | `[4]`, `[6]`, `[21]`, `[23]`, `[29]`, `[31]` by hand (below); a guarded default and a `quietCopy()` seed helper for the rest |
| `phase5-c35` | **not a re-pin — a repair.** See §19 |

**The five guarded defaults apply only when the caller named neither:** `("offered" in copy || "keeping" in copy) ? copy : { ...copy, offered: true }`. The first version was `{ offered: true, ...copy }`, which silently added `offered: true` underneath a caller that said `keeping` and turned a stated decision into `disposition-conflict`. Each default carries a comment saying why the disposition is scaffolding in that suite. `c21` and `c31` deliberately have no default and name a disposition at every call site.

**Re-pinned named claims:**

- **`phase5-c2` "a new copy is NOT offered unless its owner says so"** — the claim that created the stateless default. Its original half is intact and still asserted: `addCollectorCopy` does not put a card on the table. It gains the new half — silence is not an answer either — and now also asserts that `{ offered: false }` alone is refused.
- **`phase5-c2` "`offered` is a boolean or it is refused"** → "is `true` or it is refused". `false` joins the refused list; the stored-row half (a world carrying `offered: "yes"` is invalid) is untouched, and the test says that rule stays in `validateWorld`.
- **`phase5-c21` "a new copy defaults to false, explicitly, and survives a round trip"** → "`offered: false` is written explicitly, and survives a round trip". The test was always about *storage* — that `offered` is a real key with a real boolean, not a default supplied on read. Every assertion is unchanged; the copy is now PC, which is what carries an explicit `offered: false` today. The name moved, not the guarantee.
- **`phase5-c33` "withdrawing an offer is not losing the card"** → "ending an offer…". It now asserts the withdrawal is refused *and* that the switch does the job, keeping every assertion including that the copy stops being supply.
- **`phase5-c33` commit-order test** — the expected `kinds` string is byte-identical. The stored copy is now PC so the draft's "offered" is still a real switch and the `offering` step survives in the same position.

---

## 11. Four-state tests `[4]` and `[31]`

Both guarantees are kept. Both proofs had to move, because both performed acts the batch refuses.

**`[4]` "`offered === false` is not PC, and never becomes it".** The claim is that the absence of an offer is never read as a decision to keep. It used to prove this by creating a copy that said nothing and then withdrawing an offer — both now refused. The re-pin proves it four ways instead:

1. against a **seeded** copy, which is what every copy recorded before the rule actually is: `copyDisposition` reads `"unstated"`, `copyKept` is false, and the world is valid;
2. no command can make another one — both the bare payload and `{ keeping: false }` are refused;
3. an offered copy cannot be withdrawn into it, and the refusal leaves the copy's own answer exactly as it was;
4. a PC copy's `offered: false` is not what makes it PC — the `keeping` key is, and a kept copy and a silent one stay distinguishable.

The guarantee is now asserted against the data that really has this shape rather than against a shape a command once made.

**`[31]` "neither setter ever stores `keeping: false`".** Unchanged claim, two proofs: the key is absent after a switch *away* from PC, and the withdrawals that used to be the other route are refused **without writing anything** — asserted by snapshotting the row across each refusal. The tail assertion that the copy "did not return to unstated" is inverted: it keeps the answer it had, which is the batch's point rather than a loss.

**One guarantee was genuinely dropped and has been restored elsewhere.** `[4]` previously contained the only assertion anywhere that `addCollectorCopy({… keeping: false})` leaves no `keeping` key. My re-pin replaced it with the refusal — a different guarantee — and `{ offered: true, keeping: false }` is still accepted and is *exactly* what `planFrom` sends for every new Trade/Sell copy. The adversarial pass found that no test anywhere covered the product's real payload any more. New test `[6b]` pins both of the panel's exact payloads and that `keeping: false` leaves no residue.

---

## 12. Bite verification

Eight mutations, each applied to the shipped code, suite run, code restored. Every one drew blood.

| # | Mutation | Result |
|---|---|---|
| 1 | Remove the creation gate entirely | 3 FAIL — `[3]`, `[6]`, `[33]` |
| **1b** | **Keep only the XOR half — my narrow first draft** | **1 FAIL — `[3]`** |
| 2 | Allow `false` in `setCollectorCopyOffered` | 3 FAIL — `[10]`, `[11]`, `[33]` |
| 3 | Allow `false` in `setCollectorCopyKept` | 4 FAIL — `[10]`, `[11]`, `[14]`, `[33]` |
| 4 | Move the creation gate below `ctx.id` | 1 FAIL — `[6]` |
| 5 | Remove the panel's local check | 1 FAIL — `[17]` |
| **5b** | **Let the plan emit a step for an unanswered draft** | **1 FAIL — `[19b]`** |
| 6 | Add the XOR rule to `validateWorld` | **8 FAIL**, including `[23]` |

Bites **1b** and **5b** are the ones worth noting: both exist because the adversarial pass found the corresponding hole, and both now fail loudly if it is reopened. Bite 6 failing eight tests — because a seeded pre-rule copy makes the whole world invalid and `valid(st)` then fails everywhere — is precisely the catastrophe the compatibility pin exists to prevent.

---

## 13. Transaction compatibility

Unchanged, and asserted rather than assumed. `[30]` drives a real deal to the trade-package door and confirms:

- a PC copy is refused `copy-not-offered`;
- an offered copy with no photographs is refused `photos-required` — photographs are still required at the door and not at birth;
- an offered, photographed copy is accepted.

`[27]` adds that a pre-rule silent copy is still refused at the same door, and that `setInterest` still answers `not-found` for it. `git diff` confirms no change to `metyet-projection.js`, `collector-view.js`, `collectorCopyStatus`, `inSupply`, `setInterest`, the trade picker, or any Opportunity command.

---

## 14. The reserved / committed copy switched to PC

**Unchanged, confirmed, and still out of scope.** `setCollectorCopyKept` still consults no deal status, so a copy already in a submitted or accepted package can be switched to PC and the partner keeps seeing it as `reserved`/`committed` with both photographs. The batch neither fixes nor worsens it: the entry condition requires `offered: true`, so requiring a disposition at creation cannot reach it, and every read model that could be widened by the new symmetry is already conjoined with a `collectorCopyStatus` check.

`phase5-c2`'s three tests covering it are re-pinned to perform the act the way it is now performed — `setCollectorCopyKept(true)` instead of `setCollectorCopyOffered(false)` — and their comments say explicitly that the gap is documented here, not fixed.

---

## 15. Full suite, build, smoke

| | |
|---|---|
| `node tests/all.cjs` | **143 suites, 4,881 assertions, 0 failed — ALL SUITES PASSED** (exit 0) |
| `npm run build` | OK |
| `npm run prod` | PRODUCTION BUILD OK — 344,750 bytes |
| `npm run smoke` | PROD SMOKE OK — rendered 83,686 chars |

The suite was run three times: once to map the breakage, once after the re-pinning, and once clean after the adversarial corrections. The last is the one quoted.

---

## 16. Counts

| | `78ebb8d` | `8d1840a` | Movement |
|---|---|---|---|
| Exposed commands | 23 | **23** | none |
| Domain commands | 51 | **51** | none |
| Migrations | 13 | **13** | none |
| Refusal codes | 41 | **42** | **+1** — `invalid-disposition` |
| Prod bundle bytes | 344,646 | 344,750 | **+104** |

Every movement is the one the audit predicted. The +104 bytes are two Collector-facing sentences: the `WHY` entry and the local Save message.

---

## 17. `git status --porcelain`

```
```

Empty. Worktree clean at `8d1840a`, plus this document committed separately.

---

## 18. Bundle and push

**Push remains unavailable and was not worked around.** Re-verified at the end of this batch:

```
remote: access denied by the git proxy: Davi17000/metyet-app is not in this
session's authorized repository set, so the proxy will not inject a credential
for it.
fatal: ... The requested URL returned error: 403
```

The refreshed bundle covers `64f88e1..HEAD`. **Commit to fetch: `8d1840a6b8d19e351b5ab080103e228ea1334d28`.** Its SHA-256 is reported with the file.

---

## 19. Out-of-scope movement, called out

**Nothing in the non-goals list moved.** No migration; `validateWorld` untouched; no backfill or inference; no storage enum; no `setCollectorCopyDisposition`; no Goal or Goal-criteria change; no new grade/condition/cert/photo requirement; cert-without-grade still unchecked by the domain (pinned by `[32]`); canonical identity untouched; no Binder persistence or object-level membership change; no transaction, predicate, projection, Opportunity, picker, `setInterest`, `inSupply` or `collectorCopyStatus` change; no visual redesign; not merged.

**Three files outside the predicted surface changed, and each needs naming.**

**a. `domain/README.md`** — the repository's own domain contract stated the rule this batch reverses: *"**New copies default to `offered: false`.** Owning is the base fact."* It also described `offered` as changing via *"`setCollectorCopyOffered`, and **only** that"* — untrue since the four-state batch, because `setCollectorCopyKept` writes `offered: false` — and promised a Collector could *"take a card off the table"*, which is now refused. A contract document that says the opposite of the code is a false comment at the largest available scale. All three statements corrected; the new §3 states the rule, says the two setters are both writers, and records that the requirement is at the command boundary and deliberately not in `validateWorld`.

**b. `collector/MetYetCollector.jsx`** — one comment, the only place outside `domain/`, `client/` and `tests/` that still asserted *"the command itself defaults to not offered"*. Corrected; no code changed in that file.

**c. `tests/phase5-c35-close-the-loop.cjs`** — **this one is a defect I introduced and did not notice.** Its fixture called `addCollectorCopy` with no disposition and never checked the result, so after my gate landed the copy was never created, and the test — *"a card you own, wanted by nobody, is not an answer either"*, asserting `discoveries.length === 0` — passed because the fixture was absent rather than because the behaviour held. It was green in the full suite and would have shipped that way. Fixed with a disposition **and** a `statusCode` check, so the next time the fixture stops working the test says so.

**And one more of the same kind, inside a suite I had already re-pinned.** `phase5-c2`'s route-guard loop (*"a browser cannot name an owner"*) sends a payload claiming an actor and asserts 400-or-409. Its point is that the *route* refuses the claim before any command runs. With no disposition in the copy, the command itself now answers 409, so the loop would have passed with the route guard deleted. Fixed: the copy is legal, and a 409 is asserted not to be `invalid-disposition`.

**Smaller corrections from the same pass**, each a claim that had become false or an assertion that had become hollow: four stale comment blocks in `metyet-commands.js` (two setter headers describing an asymmetry and an "off" that no longer exist, and the block below the creation gate describing a copy the command can no longer make); the claim that *"every refusal this command can give consumes nothing"*, which is false of `copy-in-use` and is now stated precisely in both the code and the test; `gradingOf` described as returning a string when it returns an object with a `.state`; two tautological assertions in `collector-identity-stabilization` that re-read a literal the test had just seeded, replaced with assertions through the domain's own reader; a tautological conjunct in four-state `[4]`; a duplicate case (`true && 1`) in `[11]`; a straight-apostrophe regex in `[15]` that a typographic apostrophe would have slipped past; and two over-claiming test names, `[19]` (*"the panel never sends a `false` disposition"*, which it could not see — a `record-copy` step carries its disposition one level down) and `[29]`.

**Nothing supposedly untouched changed silently.** The thirteen re-pinned suites, the README and the prototype comment are the whole of it, and every one is listed above.

---

## The Binder batch has not been started.
