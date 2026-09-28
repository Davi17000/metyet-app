/* ============================================================================
   WHICH MetYet CARD IS THIS? (Phase 5 C8)

   The other half of the seam. `mapping.js` decided what a row SAYS; this decides
   which canonical card it MEANS, by asking the catalog and by accepting whatever
   the catalog answers — including "more than one" and "none".

   THE BOUNDARY IS THE POINT. A row may become inventory only when it lands on
   exactly one existing canonical card. Nothing here mints identity, upserts a
   context, creates a printing, or writes to the catalog at all: the only catalog
   call is a read. A spreadsheet is a claim about somebody's shelf, not a claim
   about what cards exist.

   FOUR ANSWERS, AND THE THIRD IS THE ONE THAT MATTERS:

     resolved    exactly one active canonical card. Eligible for import.
     unresolved  the release, the number or the name is not in MetYet's catalog,
                 or the exact printing the row named is not. Honest and useful:
                 with the catalog as thin as it is, this is most of the evidence
                 a pilot produces.
     ambiguous   the row could mean more than one card and does not say which.
                 NOT resolved by choosing — not the first, not the most common,
                 not the one with a price. A tool that guesses here produces a
                 shelf that looks right and is wrong, which is worse than a shelf
                 with a gap in it.
     invalid     refused before this point, by the mapper.

   WHAT SILENCE MEANS, WHICH IS THE ONE REAL JUDGEMENT IN THIS FILE. A row that
   names no printing has not said "the ordinary printing"; it has said nothing.
   If the card has exactly one active printing in MetYet, nothing needs saying —
   there is one answer and silence cannot be wrong about it. If it has several,
   silence is an ambiguity and is reported as one. That rule is the whole reason
   this file does not call `withDefaults` on a source row: defaulting turns "the
   file did not say" into "unlimited, non-holo, English, unstamped, standard",
   which is a five-part assertion nobody made.
   ============================================================================ */

const OUTCOME = Object.freeze({
  resolved: "resolved",
  unresolved: "unresolved",
  ambiguous: "ambiguous",
});

const REASON = Object.freeze({
  noExpansion: "no-such-expansion",
  noCard: "no-such-card",
  noPrinting: "no-such-printing",
  manyCards: "many-cards-one-number",
  manyPrintings: "many-printings",
});

const DIMENSIONS = Object.freeze(["printRun", "finish", "language", "stamp", "printVariation"]);

/* How a candidate is described back to the founder. Enough to choose by eye and
   to write down in a template afterwards; no provider id, because there is none
   and there must not be. */
const describe = (context, card) => ({
  canonicalCardId: card.canonicalCardId,
  cardContextId: context.cardContextId,
  cardName: context.cardName,
  collectorNumber: context.collectorNumber,
  discriminator: context.discriminator || "",
  printRun: card.printRun,
  finish: card.finish,
  language: card.language,
  stamp: card.stamp,
  printVariation: card.printVariation,
});

/* One normalized record against the catalog. `catalog` is the catalog
   repository; the only method used is the read. */
async function resolveIdentity(catalog, identity, { game = "pokemon" } = {}) {
  const found = await catalog.findCardIdentity({
    game,
    expansionCode: identity.expansion,
    collectorNumber: identity.collectorNumber,
    cardName: identity.cardName,
  });

  if (!found.expansion) {
    const couldMean = (found.couldMean || []).map((e) => `${e.code} (${e.name})`).join(", ");
    return { outcome: OUTCOME.unresolved, reason: REASON.noExpansion,
      detail: `MetYet's catalog holds no release with the code "${identity.expansion}"`
        + (couldMean ? ` — did the file mean ${couldMean}? MetYet matches releases by CODE, `
          + `so a mapping that supplies the name needs the code instead` : "") };
  }
  if (!found.contexts.length) {
    return { outcome: OUTCOME.unresolved, reason: REASON.noCard,
      detail: `${found.expansion.name} holds no card numbered ${identity.collectorNumber} named `
        + `"${identity.cardName}"` };
  }
  /* MORE THAN ONE CONTEXT IS A REAL AMBIGUITY IN THE SOURCE. The discriminator
     is part of a context's identity and a spreadsheet does not carry one, so a
     release that reuses a number and a name gives two honest candidates. */
  if (found.contexts.length > 1) {
    return { outcome: OUTCOME.ambiguous, reason: REASON.manyCards,
      detail: `${found.contexts.length} cards in ${found.expansion.name} share number `
        + `${identity.collectorNumber} and that name; the file does not say which`,
      candidates: found.contexts.flatMap(({ context, cards }) =>
        cards.map((card) => describe(context, card))) };
  }

  const { context, cards } = found.contexts[0];
  if (!cards.length) {
    return { outcome: OUTCOME.unresolved, reason: REASON.noPrinting,
      detail: `MetYet knows the card but holds no active printing of it` };
  }

  /* Filter by what the row ACTUALLY said, dimension by dimension. A dimension
     the row was silent about does not filter — it is not a constraint. */
  const stated = DIMENSIONS.filter((d) => identity.dimensions[d] !== undefined);
  const matching = cards.filter((card) => stated.every((d) => card[d] === identity.dimensions[d]));

  if (matching.length === 1) {
    return { outcome: OUTCOME.resolved, card: describe(context, matching[0]),
      stated, candidates: [describe(context, matching[0])] };
  }
  if (!matching.length) {
    const said = stated.length
      ? stated.map((d) => `${d}=${identity.dimensions[d]}`).join(", ")
      : "no printing";
    return { outcome: OUTCOME.unresolved, reason: REASON.noPrinting,
      detail: `MetYet knows the card but has no printing matching ${said}`,
      candidates: cards.map((card) => describe(context, card)) };
  }
  /* Several left. Either the row said nothing and the card has several
     printings, or it said something that does not narrow to one. Both are the
     same answer: the file has not identified a card. */
  const missing = DIMENSIONS.filter((d) => identity.dimensions[d] === undefined
    && new Set(matching.map((c) => c[d])).size > 1);
  return { outcome: OUTCOME.ambiguous, reason: REASON.manyPrintings,
    detail: `${matching.length} printings of this card match; the file does not say which`
      + (missing.length ? ` — it states no ${missing.join(", ")}` : ""),
    candidates: matching.map((card) => describe(context, card)) };
}

module.exports = { resolveIdentity, OUTCOME, REASON, DIMENSIONS };
