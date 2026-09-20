/* ============================================================================
   CANONICAL CARD IDENTITY (Phase 5 Batch 5)

   What MetYet means by "the same card", owned by MetYet and by nothing else.

   THREE LEVELS, AND THE REASON FOR EACH.

     Expansion      one release with its own checklist and printed total.
     Card Context   one line on that checklist: a number and a name.
     Canonical Card one independently collectible printing of that line.

   A Card Context is what a person browses — one tile, one piece of artwork. A
   Canonical Card is what a Goal, an Inventory copy or a Binder entry points at
   for ever. The split exists because a search grid full of the same picture
   three times is a bad grid, and because a Collector who wants the 1st Edition
   does not want the Unlimited.

   WHY THE COLLECTOR NUMBER IS NOT ENOUGH. Celebrations: Classic Collection
   reprints cards under their ORIGINAL numbering, so four different cards in
   that one release are all numbered 15 — Venusaur, Here Comes Team Rocket!,
   Rocket's Zapdos and Claydol. Measured across the 18,210 printings this
   repository already holds, `(expansion, number)` collides exactly there, and
   adding the card name removes every collision. So the name is part of the
   context, and `discriminator` is reserved for the anomaly nobody has found
   yet — because a future collision should cost a data fix, not an id
   migration.

   WHY THE NUMBER IS A STRING. `TG01`, `H12`, `182a`, `83/82` (a secret rare
   past its own printed total) and — in Unseen Forces, where the Unown run is
   numbered by letter — literally `!` and `?`. Nothing here parses it, bounds it
   by a printed total, or sorts it as a number.

   WHAT IS DELIBERATELY ABSENT. Grade, grading company, certification number and
   condition describe a physical copy somebody holds, not which card it is; ask
   and cost describe a sale. Artwork, artist, rarity and value describe or
   accompany a card without identifying it — the same illustration appears in
   several releases and is a different card in each. None of them appear in any
   key in this file, and a test says so.

   WHAT IS RESERVED. `stamp` and `printVariation` are dimensions the hobby
   genuinely has and no data source supplies: a prerelease-stamped card shares
   its release AND its number with the standard one, and a systematically
   corrected misprint shares everything. They sit in the key from the first day
   at their default, so that populating them later ADDS cards rather than
   renumbering every card MetYet has ever minted.
   ========================================================================== */

/* ------------------------------------------------------------------ GAMES

   The pilot is Pokémon and may stay that way. `game` is carried anyway because
   carrying it costs one column and one key segment, and not carrying it would
   make "pokemon" an assumption buried in every row. */
const GAMES = Object.freeze(["pokemon"]);

/* --------------------------------------------------------- THE VOCABULARY

   Industry words, not any provider's. A provider that says `unlimitedHolofoil`
   is translated into two of these; a provider that says `holo: true` is
   translated into one. Neither vocabulary reaches this file.

   EXTENSION IS ADDING A VALUE HERE, never widening a check somewhere else. The
   database does not constrain these columns precisely so that a new value is a
   change to this list and a migration is not required to recognise a
   collectible the hobby already recognises. What stops a bad value reaching a
   row is the repository asking this module first. */

/* The print run: which pass of the presses this card came from. Mostly a
   WotC-era question — `not_applicable` is the honest answer for the great
   majority of modern cards, which had exactly one run. `fourth_print` is here
   because the hobby distinguishes it (a Base Set copy whose copyright reads
   1999-2000) even though no data source enumerates it. */
const PRINT_RUNS = Object.freeze([
  "first_edition",
  "shadowless",
  "unlimited",
  "fourth_print",
  "not_applicable",
]);

/* The finish: how the card is printed, not how well it survived. */
const FINISHES = Object.freeze([
  "non_holo",
  "holofoil",
  "reverse_holofoil",
  "cosmos_holofoil",
  "cracked_ice_holofoil",
  "confetti_holofoil",
]);

/* Stamps. Reserved: no source supplies these, and MetYet does not guess them.
   A prerelease card shares its release and its collector number with the
   standard printing, so without this dimension the two would be one card. */
const STAMPS = Object.freeze([
  "none",
  "prerelease",
  "staff",
  "league",
]);

/* Systematic printing variations — a whole run printed wrong, and the run
   printed after somebody noticed. NOT a bent corner or an off-centre cut: those
   describe one physical copy and belong to a Copy. */
const PRINT_VARIATIONS = Object.freeze([
  "standard",
  "error",
  "corrected",
]);

/* ISO 639-1. English only is imported for the pilot; the dimension exists from
   the start because a Japanese card is a different card, and discovering that
   after minting ids would be expensive. */
const LANGUAGE = /^[a-z]{2}$/;

const DEFAULTS = Object.freeze({
  printRun: "not_applicable",
  finish: "non_holo",
  language: "en",
  stamp: "none",
  printVariation: "standard",
});

/* ------------------------------------------------------- UNKNOWN IS NOT A VALUE

   There is deliberately no `unknown` in any vocabulary above.

   A source value MetYet cannot map is not a card with an unknown dimension; it
   is a record MetYet does not yet understand. Minting `print_run = unknown`
   would create a canonical card that a Goal could point at and an Inventory
   copy could match — a real, durable, wrong answer. The translation boundary
   quarantines such a record instead, where it is visible, countable and fixable
   and where nothing can match it.

   `not_applicable` is a different statement and a true one: this release had a
   single print run, so the question does not arise. */

/* ------------------------------------------------------------ NATURAL KEYS

   A natural key answers "is this the same thing I already have?" during an
   import. It is NOT an identity: nothing outside the catalog ever stores one,
   because every segment of it is a judgement MetYet made about somebody else's
   data, and judgements get corrected. Identity is the opaque id the repository
   mints, which survives the correction. The catalog repository mints it.

   ESCAPED, NOT JUST JOINED. A collector number is an arbitrary string, so a
   separator that could occur inside one would let two different cards agree on
   a key. Backslash escapes itself and the separator; nothing else is touched,
   so the key stays readable in a diagnostic. */
const SEP = "|";
const escape = (value) => String(value).replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
const joinKey = (parts) => parts.map(escape).join(SEP);

const text = (value) => (typeof value === "string" ? value.trim() : "");

/* Case folding is applied to the CARD NAME only, and only for the key. Sources
   disagree about capitalisation far more than they disagree about spelling, and
   two records for "Here Comes Team Rocket!" that differ only in case are one
   card. The number is NOT folded: `182a` and `182A` are not known to be the
   same thing, and guessing that they are is exactly the sort of silent
   collapsing this batch exists to prevent. */
function cardContextNaturalKey(context) {
  const game = text(context && context.game);
  const expansionId = text(context && context.expansionId);
  const collectorNumber = text(context && context.collectorNumber);
  const cardName = text(context && context.cardName);
  const discriminator = text(context && context.discriminator);
  if (!GAMES.includes(game)) throw new TypeError(`card identity: unknown game "${game}"`);
  if (!expansionId) throw new TypeError("card identity: a context needs its expansion");
  if (!collectorNumber) throw new TypeError("card identity: a context needs a collector number");
  if (!cardName) throw new TypeError("card identity: a context needs a card name");
  return joinKey([game, expansionId, collectorNumber, cardName.toLowerCase(), discriminator]);
}

/* The five dimensions, always all five, always in this order. A card whose
   stamp is `none` still carries the segment, which is what makes adding
   stamped cards later additive rather than a renumbering. */
function canonicalCardNaturalKey(card) {
  const cardContextId = text(card && card.cardContextId);
  if (!cardContextId) throw new TypeError("card identity: a canonical card needs its context");
  const printRun = text(card && card.printRun) || DEFAULTS.printRun;
  const finish = text(card && card.finish) || DEFAULTS.finish;
  const language = text(card && card.language) || DEFAULTS.language;
  const stamp = text(card && card.stamp) || DEFAULTS.stamp;
  const printVariation = text(card && card.printVariation) || DEFAULTS.printVariation;
  assertVocabulary({ printRun, finish, language, stamp, printVariation });
  return joinKey([cardContextId, printRun, finish, language, stamp, printVariation]);
}

/* The one place a dimension value is judged. The repository calls it before it
   writes and the translation boundary calls it before it decides a record is
   mappable, so an unrecognised word cannot reach a row by any path. */
function assertVocabulary({ printRun, finish, language, stamp, printVariation }) {
  if (!PRINT_RUNS.includes(printRun)) throw new TypeError(`card identity: unknown print run "${printRun}"`);
  if (!FINISHES.includes(finish)) throw new TypeError(`card identity: unknown finish "${finish}"`);
  if (!LANGUAGE.test(language)) throw new TypeError(`card identity: unknown language "${language}"`);
  if (!STAMPS.includes(stamp)) throw new TypeError(`card identity: unknown stamp "${stamp}"`);
  if (!PRINT_VARIATIONS.includes(printVariation)) {
    throw new TypeError(`card identity: unknown print variation "${printVariation}"`);
  }
  return true;
}

/* Whether a set of dimensions is nameable at all, without throwing — for a
   caller deciding between "map this" and "quarantine this". */
function knownVocabulary(dimensions) {
  try { assertVocabulary({ ...DEFAULTS, ...dimensions }); return true; }
  catch (error) { return false; }
}

/* The five dimensions with every unstated one at its default, which is the
   shape a row is written from. Unstated is not unknown: a caller that does not
   mention `stamp` is describing an unstamped card. */
const withDefaults = (dimensions) => ({
  printRun: text(dimensions && dimensions.printRun) || DEFAULTS.printRun,
  finish: text(dimensions && dimensions.finish) || DEFAULTS.finish,
  language: text(dimensions && dimensions.language) || DEFAULTS.language,
  stamp: text(dimensions && dimensions.stamp) || DEFAULTS.stamp,
  printVariation: text(dimensions && dimensions.printVariation) || DEFAULTS.printVariation,
});

/* An expansion's key. The code is MetYet's own short handle for a release, not
   a provider's — a provider's set id reaches the catalog only through a source
   mapping. Subsets that print their own checklist and their own printed total
   (a Trainer Gallery, a Radiant Collection) are expansions in their own right,
   which is how the numbering `TG01/30` stays coherent. */
function expansionNaturalKey(expansion) {
  const game = text(expansion && expansion.game);
  const code = text(expansion && expansion.code);
  if (!GAMES.includes(game)) throw new TypeError(`card identity: unknown game "${game}"`);
  if (!code) throw new TypeError("card identity: an expansion needs a code");
  return joinKey([game, code.toLowerCase()]);
}

module.exports = {
  GAMES, PRINT_RUNS, FINISHES, STAMPS, PRINT_VARIATIONS, DEFAULTS,
  expansionNaturalKey, cardContextNaturalKey, canonicalCardNaturalKey,
  assertVocabulary, knownVocabulary, withDefaults,
};
