/* ============================================================================
   A PRINTING, IN WORDS — SHARED BY BOTH WORKSPACES (Milestone 2D.3)

   The catalogue's own codes (`non_holo`, `not_applicable`, `en`) said as the
   product says them: "Normal", nothing for the usual print run, nothing for
   English. Moved here unchanged from client/collector/present.js, which
   re-exports it, so the Collector app and the Trusted Partner workspace name
   one printing the same way without either importing the other. Pure
   presentation: it decides no identity, match or price.
   ========================================================================== */
const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

/* The prototype's version words (fixtures.js FINISH_NAMES), plus what else
   makes a production printing different, said only when it is not the usual. */
const FINISH_NAMES = { non_holo: "Normal", holofoil: "Holo", reverse_holofoil: "Reverse Holo", cosmos_holofoil: "Cosmos Holo" };
const titled = (s) => String(s).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
/* `siblings` are the card's other printings: a print run that is usually left
   unsaid ("Unlimited") is said when a sibling differs by it, so "Holo ·
   Unlimited" and "Holo · First Edition" can be told apart. */
/* What else makes a printing different, besides its finish — each said only
   when it is not the usual. Shared by both labels below. */
const qualifiers = (card, siblings = []) => [
  card.printRun && card.printRun !== "not_applicable" && (card.printRun !== "unlimited"
    || siblings.some((o) => o !== card && o.finish === card.finish && o.printRun !== card.printRun)) ? titled(card.printRun) : null,
  card.stamp && card.stamp !== "none" ? `${titled(card.stamp)} stamp` : null,
  card.printVariation && card.printVariation !== "standard" ? titled(card.printVariation) : null,
  card.language && card.language !== "en" ? card.language.toUpperCase() : null,
].filter(Boolean);
export const versionLabel = (card, siblings = []) => [
  FINISH_NAMES[card.finish] || titled(card.finish || "Version"),
  ...qualifiers(card, siblings),
].join(" · ");

/* A printing as one line — set, number and version — from the canonical card
   the catalogue described (Milestone 2C.3), in the Browse card's own words
   (`versionLabel`'s). Pure presentation: it decides no identity, match or
   price. Two Goals for one card in different finishes must never read alike,
   so the finish is always said when the catalogue names one — and nothing is
   invented when it does not: no "Version" placeholder, only what is known. */
export const printingLine = (card) => (card
  ? [text(card.expansionName), card.collectorNumber ? `#${card.collectorNumber}` : null,
    text(card.finish) ? FINISH_NAMES[card.finish] || titled(card.finish) : null,
    ...qualifiers(card)].filter(Boolean).join(" · ") || null
  : null);

