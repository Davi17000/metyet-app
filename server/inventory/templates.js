/* ============================================================================
   THE SHAPES WE HAVE SEEN (Phase 5 C8)

   A template is a declaration MetYet owns about somebody else's file: which
   column carries which MetYet field, which columns are deliberately ignored,
   and which of their words translate into which of ours.

   CONFIGURATION, NOT A DOMAIN CONCEPT, AND ON PURPOSE. There is no templates
   table, no migration, no aggregate, no id, no version. A template is a frozen
   object in this file, and `--template=<name>` picks one; `--mapping=<path>`
   takes a JSON file for a shape nobody has written down yet, which is how a new
   TP is onboarded without a code change. When a template has earned a name it
   moves into this file in a pull request somebody reads, which is the review
   step a database row would not have had.

   Adding one is adding an entry below. It changes no model, no schema and no
   command, which is the property worth protecting: if adding "Card Ladder"
   later required touching the inventory model, the seam would be in the wrong
   place.

   WHAT A TEMPLATE CANNOT DO. It cannot introduce a word the domain does not
   know — `checkTemplate` asks `domain/card-identity.js` and
   `domain/metyet-domain.js` about every translation when the mapper is built,
   so a sixth print run or a `PSA 9.5` written down here is a startup error, not
   a wrong copy found later. It cannot map two MetYet fields to one column. It
   cannot mark a column both mapped and ignored. And it cannot relax a domain
   invariant, because it never reaches one: everything it produces goes through
   the same command a person clicking Save goes through.
   ============================================================================ */

/* ---------------------------------------------------------------- VOCABULARY

   The translations that are true of the hobby rather than of one product, kept
   here so several templates can share them and so each template's own list is
   only what is unusual about that source. Every value is a word the domain
   owns; `checkTemplate` proves it. */
/* WHAT IS NOT IN HERE, AND WHY (Phase 5 C8, corrected after review).
   An earlier draft translated `none`, `no`, `n/a`, `na` and `standard` into
   `non_holo` and `not_applicable`. Those are not translations, they are the
   default this whole design refuses to invent, smuggled in through
   configuration: `not_applicable` is a positive claim about a release (see
   `domain/card-identity.js`), and a cell saying "N/A" is a person saying they
   did not record it. So three spellings of "I didn't write it down" were
   importing a confident print-run assertion while the honest blank cell was
   correctly reported as ambiguous. A blank is silence; so is "N/A". */
const FINISH_WORDS = Object.freeze({
  "normal": "non_holo",
  "non holo": "non_holo",
  "non holofoil": "non_holo",
  "nonfoil": "non_holo",
  /* `no` and `yes` are the pair a boolean `Foil` column uses, and "no" in a
     column headed Foil is an ANSWER rather than a shrug — which is exactly the
     line the note above draws. `none` stays out: in a foil column it reads as
     "nothing recorded" as readily as "not foil". */
  "no": "non_holo",
  "holo": "holofoil",
  "holofoil": "holofoil",
  "holo rare": "holofoil",
  "foil": "holofoil",
  "yes": "holofoil",
  "reverse": "reverse_holofoil",
  "reverse holo": "reverse_holofoil",
  "reverse holofoil": "reverse_holofoil",
  "cosmos": "cosmos_holofoil",
  "cosmos holo": "cosmos_holofoil",
  "cracked ice": "cracked_ice_holofoil",
  "confetti": "confetti_holofoil",
});

const PRINT_RUN_WORDS = Object.freeze({
  "1st": "first_edition",
  "1st ed": "first_edition",
  "1st edition": "first_edition",
  "first edition": "first_edition",
  "shadowless": "shadowless",
  "unlimited": "unlimited",
  "unl": "unlimited",
  "4th print": "fourth_print",
  "fourth print": "fourth_print",
  /* No entry for "n/a", "na", "none" or "standard" — see the note above
     FINISH_WORDS. `not_applicable` is a claim, not a shrug. */
});

const STAMP_WORDS = Object.freeze({
  /* `none` IS a real stamp value rather than a default — an unstamped card is a
     fact somebody can state, and `none` is the word for it. It stays. */
  "none": "none",
  "unstamped": "none",
  "prerelease": "prerelease",
  "pre release": "prerelease",
  "staff": "staff",
  "league": "league",
  "league promo": "league",
});

/* ONLY ABBREVIATIONS OF MetYet's OWN WORDS (Phase 5 C8, corrected after review).
   An earlier draft also mapped `Mint` to Near Mint, `Excellent` to Lightly
   Played, `Good` to Moderately Played and `Poor` to Heavily Played. Those are
   not translations of the same fact — they are re-grades, and they are wrong in
   money: Mint and Near Mint are different cards to a buyer, and "Excellent" in
   grader vocabulary sits nearer Moderately Played than Lightly Played. The
   mapper's own header promises it is "unyielding about SUBSTANCE … never guessed
   at", and those four entries were guesses written down where nobody would look
   for them. A file using a different condition scale should be REPORTED as
   using one, which is what happens now. */
const CONDITION_WORDS = Object.freeze({
  "nm": "Near Mint",
  "near mint": "Near Mint",
  "lp": "Lightly Played",
  "lightly played": "Lightly Played",
  "mp": "Moderately Played",
  "moderately played": "Moderately Played",
  "hp": "Heavily Played",
  "heavily played": "Heavily Played",
  "dmg": "Damaged",
  "damaged": "Damaged",
});

/* Raw is the one grade word worth translating, because a source that writes
   "Ungraded" means it. Every OTHER grade is left alone deliberately: `PSA 9`
   already is MetYet's word, and a source that says `BGS 9.5` is saying
   something MetYet cannot hold, which the mapper must report rather than a
   template quietly bend. */
const GRADE_WORDS = Object.freeze({
  "raw": "Raw",
  "ungraded": "Raw",
  /* Not "none" or "n/a": a blank grade means nobody said, and "Raw" is a claim
     that the card is ungraded. The domain models unstated and raw as different
     things and so does this. */
});

const LANGUAGE_WORDS = Object.freeze({
  "english": "en",
  "en": "en",
  "eng": "en",
  "japanese": "ja",
  "ja": "ja",
  "jp": "ja",
  "german": "de",
  "de": "de",
  "french": "fr",
  "fr": "fr",
});

/* ----------------------------------------------------------------- TEMPLATES */

const TEMPLATES = Object.freeze({

  /* ⚠ PROVISIONAL AND SYNTHETIC. These headers are a GUESS at the shape of a
     Collectr export, written by us from the outside for development and
     testing. They are NOT Collectr's schema, they were not taken from a real
     export, and no claim is made that any of them is right. Every report this
     template appears in says "provisional" beside its name, because a template
     that is wrong about a file is invisible until somebody checks a row.

     Justin's real export replaces this. Until it arrives, the value of this
     entry is that it exercises the contract, not that it describes a product. */
  "collectr-provisional": {
    name: "Collectr — provisional",
    provisional: true,
    note: "Synthetic, written from the outside. Not Collectr's schema and not "
      + "taken from a real export. Replace on first contact with a real file.",
    columns: {
      cardName: "Card Name",
      expansion: "Set Code",
      collectorNumber: "Card Number",
      language: "Language",
      printRun: "Edition",
      finish: "Foil",
      stamp: null,              // this shape carries no stamp column
      printVariation: null,     // nor an error/corrected distinction
      quantity: "Quantity",
      gradingCompany: "Grader",
      numericGrade: "Grade",
      condition: "Condition",
      cert: "Cert Number",
      ask: "Listed Price",
      cost: "Purchase Price",
      sourceRowId: "Item ID",
      portfolio: "Collection",
    },
    ignore: ["Market Value", "Last Updated", "Image URL", "Notes"],
    vocabulary: {
      finish: FINISH_WORDS,
      printRun: PRINT_RUN_WORDS,
      condition: CONDITION_WORDS,
      language: LANGUAGE_WORDS,
    },
  },

  /* A plain spreadsheet with everything in one grade column and no separate
     grader — the shape a shop that has never used a product writes by hand.
     Kept deliberately minimal: it is the template a founder copies and edits. */
  "custom-spreadsheet": {
    name: "Custom spreadsheet",
    note: "A starting point for a shop's own sheet. Copy it, rename the headers, "
      + "and pass it with --mapping rather than editing this file.",
    columns: {
      cardName: "Card",
      expansion: "Set",
      collectorNumber: "Number",
      language: "Language",
      printRun: "Print Run",
      finish: "Finish",
      stamp: "Stamp",
      printVariation: "Variation",
      quantity: "Qty",
      grade: "Grade",
      condition: "Condition",
      cert: "Cert",
      ask: "Ask",
      cost: "Cost",
      sourceRowId: "Row",
      portfolio: null,
    },
    ignore: [],
    vocabulary: {
      finish: FINISH_WORDS,
      printRun: PRINT_RUN_WORDS,
      stamp: STAMP_WORDS,
      grade: GRADE_WORDS,
      condition: CONDITION_WORDS,
      language: LANGUAGE_WORDS,
    },
  },
});

const templateNames = () => Object.keys(TEMPLATES);
const readTemplate = (name) => {
  const found = TEMPLATES[typeof name === "string" ? name.trim() : ""];
  return found ? JSON.parse(JSON.stringify(found)) : null;
};

module.exports = {
  TEMPLATES, templateNames, readTemplate,
  FINISH_WORDS, PRINT_RUN_WORDS, STAMP_WORDS, CONDITION_WORDS, GRADE_WORDS, LANGUAGE_WORDS,
};
