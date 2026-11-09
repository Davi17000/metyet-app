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
/* The printed number: "173/165" when the catalogue's description carries the
   release's printed total (`expansionPrintedTotal`, M3B B4), else "#173" —
   never a made-up denominator. A number that is not plain digits ("TG05",
   "SWSH050") is printed with its own total, if any, in a form the catalogue
   does not record, so it is shown as itself. One wording for every surface
   that names a printing, so the same card never reads two ways on a screen. */
const totalOf = (card) => (Number.isInteger(card.expansionPrintedTotal) && card.expansionPrintedTotal > 0
  ? card.expansionPrintedTotal : null);
export const cardNumber = (card) => {
  const n = card ? text(card.collectorNumber) : null;
  if (!n) return null;
  return /^\d+$/.test(n) && totalOf(card) ? `${n}/${totalOf(card)}` : `#${n}`;
};

export const printingLine = (card) => (card
  ? [text(card.expansionName), cardNumber(card),
    text(card.finish) ? FINISH_NAMES[card.finish] || titled(card.finish) : null,
    ...qualifiers(card)].filter(Boolean).join(" · ") || null
  : null);


/* A RAW COPY, SAID ONE WAY (M3B B4): its condition, then "Ungraded" — never
   also "Raw · …" elsewhere for the same card. */
export const rawLine = (condition) => (text(condition) ? `${text(condition)} · Ungraded` : "Ungraded");

/* A copy's condition, from its own record: a grade (and cert) for a graded
   card, a condition and "Ungraded" for a raw one. A record that says neither
   says so; one that contradicts itself shows both halves. */
export function conditionLine(copy) {
  if (!copy) return null;
  const g = copy.grading && typeof copy.grading === "object" ? copy.grading : null;
  const grade = text(copy.grade);
  const condition = text(copy.condition);
  const cert = text(copy.cert);
  if (g && g.problem && grade && condition) return `Says ${grade} and ${condition}`;
  if ((g && g.state === "graded") || (!g && grade && !/^raw$/i.test(grade))) {
    return [grade || text(g && g.label), cert ? `Cert ${cert}` : null].filter(Boolean).join(" · ");
  }
  if ((g && g.state === "raw") || (grade && /^raw$/i.test(grade))) return rawLine(condition);
  return condition || "Condition not stated";
}

/* A copy's grading as a deal names it (M3B B4): the projected reading's own
   label for a graded copy, `rawLine` for a raw one — so a deal never calls one
   card both "Raw · Near Mint" and "Near Mint · Ungraded". */
export const dealGradeLine = (copy) => {
  const reading = copy && copy.grading && typeof copy.grading === "object" ? copy.grading : null;
  if (!reading || !text(reading.label)) return null;
  return reading.state === "raw" ? rawLine(reading.condition) : reading.label;
};
