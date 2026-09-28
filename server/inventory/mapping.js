/* ============================================================================
   WHAT DOES THIS COLUMN MEAN? (Phase 5 C8)

   A Trusted Partner already has their inventory in a file. It is somebody
   else's shape: their column names, their words for a foil, their way of
   writing a grade. MetYet's job is the translation, and this file is the whole
   of it.

   ONE QUESTION, AND DELIBERATELY NOT THE OTHER. This answers "what does this
   incoming field and value MEAN" — it turns `Qty` into `quantity` and `1st Ed`
   into `first_edition`. It never answers "WHICH MetYet card is this", which is
   the catalog's question and is asked afterwards, against the catalog, by
   `resolve.js`. Collapsing the two is how a spreadsheet ends up minting card
   identity, so the seam is kept visible: nothing in this file reads a database
   or knows that canonical cards exist.

   FLEXIBLE INPUT, STRICT CANONICAL IDENTITY. The mapper is generous about
   FORM — headers with stray spaces and odd case, `1,150.00` for a price, `NM`
   for Near Mint, a blank cell meaning "nobody said". It is unyielding about
   SUBSTANCE: a word it has not been taught is refused by name, never guessed
   at, never defaulted, and never dropped. Every refusal names the field, the
   value it could not read and why, because the point of this tool is to tell
   the founder what a file says, including the parts MetYet cannot hear.

   WHAT IT WILL NOT DO, stated because each one is a tempting shortcut:

     - it will not invent a missing collector number, card name or release;
     - it will not read a printing off a price, a rarity, or a set's era;
     - it will not take the TP's own language as a card's language;
     - it will not choose between two printings the row could mean;
     - it will not translate a variant word nobody has declared;
     - it will not treat a provider's row id as MetYet identity — a source id
       is carried as a diagnostic and reaches no card and no copy.

   A CSV IS UNTRUSTED INPUT AND IS ONLY EVER DATA. No cell is evaluated, ever,
   by anything. A cell beginning `=`, `+`, `-` or `@` is a spreadsheet formula
   and is refused where identity or money is expected rather than parsed for a
   value hiding behind it, because a formula is a statement about a spreadsheet
   and not a fact about a card. No cell is used as a path, a key, or a command.
   ============================================================================ */

const CI = require("../../domain/card-identity.js");

/* The physical-copy vocabularies the domain will accept, read from the domain
   rather than copied: a second list here is a second answer, and the one that
   drifts is always the copy. */
const D = require("../../domain/metyet-domain.js");

const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v) => (typeof v === "string" ? v.trim() : "");

/* ------------------------------------------------------------------- FIELDS

   The MetYet side of the mapping. Split on purpose into what identifies a CARD
   and what describes the TP's COPY of it, because the first is resolved against
   the catalog and the second is written onto an inventory row, and confusing
   them is how a copy's condition ends up in a card's identity. */
const IDENTITY_FIELDS = Object.freeze([
  "cardName", "expansion", "collectorNumber",
  "language", "printRun", "finish", "stamp", "printVariation",
]);
const COPY_FIELDS = Object.freeze([
  "quantity", "grade", "condition", "gradingCompany", "numericGrade", "cert", "ask", "cost",
]);
/* Carried for the founder reading a preview, and for nothing else: neither
   reaches a card or a copy. `sourceRowId` in particular is NOT identity — it is
   how a row is named in a report so a person can find it in their own file. */
const CONTEXT_FIELDS = Object.freeze(["sourceRowId", "portfolio"]);

const FIELDS = Object.freeze([...IDENTITY_FIELDS, ...COPY_FIELDS, ...CONTEXT_FIELDS]);

/* The five canonical dimensions, which are the domain's and are validated by
   the domain. `expansion` and `collectorNumber` are not dimensions — they are
   how the catalog is asked, and the catalog decides. */
const DIMENSIONS = Object.freeze(["language", "printRun", "finish", "stamp", "printVariation"]);

const INVALID = Object.freeze({
  unmappedHeader: "unmapped-header",
  missingColumn: "missing-column",
  blankIdentity: "blank-identity",
  unknownWord: "unknown-word",
  badNumber: "bad-number",
  badQuantity: "bad-quantity",
  formula: "formula-cell",
  gradingIncoherent: "grading-incoherent",
  ungradeable: "ungradeable-grade",
  tooManyValues: "two-values-for-one-field",
  duplicateColumn: "duplicate-column",
  certWithoutGrade: "cert-without-grade",
  certForMany: "cert-for-many-copies",
  tooLarge: "amount-too-large",
  tooPrecise: "amount-too-precise",
  tooMany: "quantity-too-large",
});

/* Bounds, because "finite" is not a bound. An amount is money somebody typed,
   not an arbitrary double: beyond nine figures it is a typo or a unit mistake,
   past two decimal places it is not a price, and past 2^53 the digits stop being
   the digits that were written. A quantity is a shelf, not a warehouse. */
const MAX_AMOUNT = 1000000000;      // one billion, in whole currency units
const MAX_QUANTITY = 500;

/* ---------------------------------------------------------------- CSV, PLAINLY

   RFC 4180 as far as it goes, and no further: quoted fields, doubled quotes
   inside them, commas and newlines inside quotes, CRLF or LF, and a leading
   byte-order mark. No delimiter sniffing, no type inference, no header
   de-duplication guessing — a file this cannot read is an operator's problem to
   look at, not a shape for MetYet to divine. Every cell comes out a string. */
function parseCsv(input) {
  const source = typeof input === "string" ? input.replace(/^\uFEFF/, "") : "";
  const rows = [];
  const lines = [];
  let row = [];
  let cell = "";
  let quoted = false;
  let i = 0;
  /* THE LINE THE OPERATOR WILL LOOK AT (Phase 5 C8, corrected after review).
     A row's position among the rows is not its line in the file: a blank
     separator row is dropped and a quoted newline spans two lines, so after
     either one every reported number was off by a growing amount — silently, in
     a report whose entire content is line numbers. The true line is counted here,
     where the newlines are, and travels beside the row. */
  let line = 1;
  let startedAt = 1;
  const endCell = () => { row.push(cell); cell = ""; };
  const endRow = () => { endCell(); rows.push(row); lines.push(startedAt); row = []; };
  while (i < source.length) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') { cell += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      if (c === "\n") line += 1;   // a newline inside quotes is still a line
      cell += c; i += 1; continue;
    }
    if (c === '"' && cell === "") { quoted = true; i += 1; continue; }
    if (c === ",") { endCell(); i += 1; continue; }
    if (c === "\r") { i += 1; continue; }
    if (c === "\n") { endRow(); line += 1; startedAt = line; i += 1; continue; }
    cell += c; i += 1;
  }
  /* A trailing newline ends the last row; anything else leaves one open. */
  if (cell !== "" || row.length) endRow();

  /* A row of nothing but empty cells is a spreadsheet's blank line, not a
     record, and is dropped — but its LINE is not forgotten, which is the whole
     point of carrying them. A row with FEWER cells than the header is kept: the
     missing ones read as unstated, which is a claim the mapper then judges,
     rather than a parse failure. */
  const kept = rows.map((cells, at) => ({ cells, line: lines[at] }))
    .filter((r) => r.cells.some((v) => text(v)));
  if (!kept.length) return { headers: [], rows: [], lines: [] };
  const [head, ...body] = kept;
  return {
    headers: head.cells.map((h) => text(h)),
    rows: body.map((r) => r.cells),
    lines: body.map((r) => r.line),
  };
}

/* Headers are matched on a folded form so that `Card Name`, `card name`,
   `Card  Name` and ` CARD_NAME ` are one column. The fold is deliberately
   aggressive about separators and nothing else: it never removes letters, so
   two genuinely different headers cannot collide into one. */
const foldHeader = (h) => text(h).toLowerCase().replace(/[\s_\-.]+/g, " ").trim();
/* Values fold for vocabulary lookup only. The ORIGINAL is what gets reported
   back, so a refusal quotes what the file actually said. */
const foldValue = (v) => text(v).toLowerCase().replace(/[\s_\-.]+/g, " ").trim();

const FORMULA = /^[=+@]|^-[^0-9.]/;

/* ------------------------------------------------------------- THE TEMPLATE

   Configuration, not a domain object. It says which source header carries which
   MetYet field, which headers are deliberately ignored, and which source words
   translate to which MetYet words. It is checked once, when the mapper is
   built, so a typo in a template is a startup error rather than a wrong copy
   discovered later — the same rule `createTranslator` follows for the catalog.

     {
       name: "Collectr — provisional",
       provisional: true,              // says so in every report it appears in
       note: "...",
       columns: { cardName: "Card Name", ..., stamp: null },
       ignore: ["Market Value"],
       vocabulary: { finish: { "holo": "holofoil" }, grade: { "psa 9": "PSA 9" } },
     }

   A `null` column is a field this source does not carry, which is different
   from a field nobody mapped: the first is a declaration, the second is an
   omission, and only the first is silent about it. */
function checkTemplate(template) {
  if (!isObject(template)) throw new TypeError("mapping: a template is required");
  if (!text(template.name)) throw new TypeError("mapping: a template needs a name");
  if (!isObject(template.columns)) throw new TypeError("mapping: a template needs columns");

  const seen = new Map();
  for (const [field, header] of Object.entries(template.columns)) {
    if (!FIELDS.includes(field)) {
      throw new TypeError(`mapping: "${field}" is not a MetYet inventory field`);
    }
    if (header === null || header === undefined) continue;
    if (!text(header)) throw new TypeError(`mapping: "${field}" maps to an empty header`);
    const key = foldHeader(header);
    /* Two MetYet fields reading one source column is almost always a template
       typo, and the one time it is not, it is a claim nobody could check. */
    if (seen.has(key)) {
      throw new TypeError(
        `mapping: "${header}" is mapped to both "${seen.get(key)}" and "${field}"`);
    }
    seen.set(key, field);
  }
  if (template.ignore !== undefined && !Array.isArray(template.ignore)) {
    throw new TypeError("mapping: ignore must be a list of headers");
  }
  for (const h of template.ignore || []) {
    if (!text(h)) throw new TypeError("mapping: an ignored header is empty");
    if (seen.has(foldHeader(h))) {
      throw new TypeError(`mapping: "${h}" is both mapped and ignored`);
    }
  }
  if (template.vocabulary !== undefined && !isObject(template.vocabulary)) {
    throw new TypeError("mapping: vocabulary must be an object of fields");
  }
  for (const [field, words] of Object.entries(template.vocabulary || {})) {
    if (!FIELDS.includes(field)) {
      throw new TypeError(`mapping: vocabulary names "${field}", which is not a field`);
    }
    if (!isObject(words)) throw new TypeError(`mapping: vocabulary for "${field}" maps nothing`);
    for (const [from, to] of Object.entries(words)) {
      if (!text(from)) throw new TypeError(`mapping: vocabulary for "${field}" has an empty word`);
      /* EVERY TRANSLATION LANDS IN A VOCABULARY THE DOMAIN OWNS, and it is
         checked here, once, against the domain itself. A template cannot
         introduce a sixth print run or a PSA 9.5 by writing one down. */
      if (DIMENSIONS.includes(field)) {
        if (!CI.knownVocabulary({ [field]: text(to) })) {
          throw new TypeError(`mapping: "${from}" maps ${field} to "${to}", which MetYet has no word for`);
        }
      } else if (field === "grade") {
        if (!D.GRADED_VALUES.includes(text(to))) {
          throw new TypeError(`mapping: "${from}" maps a grade to "${to}", which MetYet cannot hold`);
        }
      } else if (field === "condition") {
        if (!D.CONDITION_VALUES.includes(text(to))) {
          throw new TypeError(`mapping: "${from}" maps a condition to "${to}", which MetYet cannot hold`);
        }
      } else {
        throw new TypeError(`mapping: "${field}" takes no vocabulary`);
      }
    }
  }
  return true;
}

/* ------------------------------------------------------------- THE NUMBERS

   A price in a spreadsheet is written by a person: `1,150.00`, `$1,150`,
   `1150`, `£1,150.00`, and a blank when nobody has priced it. Those all mean
   the same amount and the mapper reads them all.

   WHAT IT REFUSES, AND WHY EACH ONE MATTERS. The domain validates money through
   `Number(...)` and then stores what it was handed, so `""` becomes 0, `true`
   becomes 1, and the string `"1150"` validates and persists as a string that
   the Trusted Partner's own screen then renders as nothing at all. Every one of
   those is a wrong number wearing the shape of a right one, so this returns a
   real JS number or it refuses out loud. A blank is neither: it is "nobody
   said", which is a legal answer that the domain models as absence. */
function readMoney(raw) {
  const value = text(raw);
  if (!value) return { stated: false };
  if (FORMULA.test(value)) return { bad: INVALID.formula };
  /* One currency symbol, thousands separators, one decimal point. Nothing
     clever: no parentheses-for-negative, no scientific notation, no ranges. */
  const stripped = value.replace(/^[$£€]\s*/, "").replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(stripped)) return { bad: INVALID.badNumber };
  /* MORE THAN TWO DECIMAL PLACES IS NOT A PRICE, and rounding one silently is
     inventing a number. `1150.9999999` is somebody's spreadsheet arithmetic
     leaking, and a shop should be told rather than charged it. */
  const [, fraction = ""] = stripped.split(".");
  if (fraction.length > 2) return { bad: INVALID.tooPrecise, was: value };
  const amount = Number(stripped);
  if (!Number.isFinite(amount)) return { bad: INVALID.badNumber };
  /* Past 2^53 the digits Number() holds are no longer the digits that were
     written — `11111111111111111111` comes back as `11111111111111110000` — so
     a bound here is not fussiness, it is the point at which the value stops
     being the one in the file. */
  if (amount > MAX_AMOUNT || !Number.isSafeInteger(Math.round(amount * 100))) {
    return { bad: INVALID.tooLarge, was: value };
  }
  return { stated: true, amount };
}

function readQuantity(raw) {
  const value = text(raw);
  if (!value) return { stated: false, quantity: 1 };
  if (FORMULA.test(value)) return { bad: INVALID.formula };
  const stripped = value.replace(/,/g, "");
  if (!/^\d+$/.test(stripped)) return { bad: INVALID.badQuantity };
  const quantity = Number(stripped);
  /* Zero is not a quantity, it is a row somebody meant to delete. Saying so is
     more useful than importing nothing and reporting success. */
  if (!Number.isInteger(quantity) || quantity < 1) return { bad: INVALID.badQuantity };
  /* One row cannot mean five hundred copies. A quantity that large is a
     mistyped cell or a units mistake, and expanding it would hold the world
     lock while it materialised — see the runner's own cap on a whole run. */
  if (quantity > MAX_QUANTITY) return { bad: INVALID.tooMany, was: value };
  return { stated: true, quantity };
}

/* A grade may arrive whole (`PSA 9`) or in two columns (`PSA` + `9`). Both are
   read; neither is guessed at. MetYet can hold `Raw` and `PSA 1` through
   `PSA 10` and NOTHING else — not BGS, not CGC, not a half point — so a card
   graded by anybody else is refused with its own reason rather than flattened
   into the nearest PSA number, which would be a fabricated grade on a real
   card. That refusal is a fact about MetYet's vocabulary, not about the file. */
function readGrade({ grade, gradingCompany, numericGrade }, words) {
  const whole = text(grade);
  const company = text(gradingCompany);
  const numeric = text(numericGrade);

  if (whole && (company || numeric)) {
    return { bad: INVALID.tooManyValues, detail: "a grade and a grading company in one row" };
  }
  if (whole) {
    if (FORMULA.test(whole)) return { bad: INVALID.formula };
    const mapped = words[foldValue(whole)];
    const value = mapped !== undefined ? mapped : whole;
    if (D.GRADED_VALUES.includes(value)) return { stated: true, grade: value };
    return { bad: /^raw$/i.test(value) ? INVALID.unknownWord : INVALID.ungradeable, was: whole };
  }
  if (!company && !numeric) return { stated: false };
  if (!company || !numeric) {
    return { bad: INVALID.blankIdentity,
      detail: company ? "a grading company with no grade" : "a grade with no grading company" };
  }
  if (FORMULA.test(company) || FORMULA.test(numeric)) return { bad: INVALID.formula };
  const label = `${company.toUpperCase()} ${numeric}`;
  if (D.GRADED_VALUES.includes(label)) return { stated: true, grade: label };
  return { bad: INVALID.ungradeable, was: `${company} ${numeric}` };
}

/* ---------------------------------------------------------------- THE MAPPER */
function createMapper({ template } = {}) {
  checkTemplate(template);
  const columns = template.columns;
  const vocabulary = template.vocabulary || {};
  const ignored = new Set((template.ignore || []).map(foldHeader));
  /* folded source header → MetYet field */
  const byHeader = new Map();
  for (const [field, header] of Object.entries(columns)) {
    if (text(header)) byHeader.set(foldHeader(header), field);
  }
  const wordsFor = (field) => {
    const raw = vocabulary[field] || {};
    const folded = {};
    for (const [from, to] of Object.entries(raw)) folded[foldValue(from)] = text(to);
    return folded;
  };
  const WORDS = Object.freeze(Object.fromEntries(FIELDS.map((f) => [f, wordsFor(f)])));

  /* What this template makes of a particular file's headers, before a single
     row is read. An unmapped header is reported, never silently tolerated and
     never silently used: the founder decides whether it is a column to map or
     a column to ignore, and until they do the file is not understood. */
  function columnsFor(headers) {
    const seen = (Array.isArray(headers) ? headers : []).map(text).filter(Boolean);
    const mapped = [];
    const ignoredHere = [];
    const unread = [];
    /* TWO COLUMNS FOR ONE FIELD IS THE SAME CLAIM `checkTemplate` REFUSES, from
       the other end (Phase 5 C8, corrected). A template mapping two fields to
       one header throws, because nobody could check which was meant. A FILE with
       two `Condition` columns is exactly as unanswerable — and an earlier draft
       took the rightmost cell and said nothing at all, which is the silent drop
       this batch exists to remove. Reported, and it makes the file not
       understood until somebody says which column is the one. */
    const times = new Map();
    for (const header of seen) {
      const key = foldHeader(header);
      times.set(key, (times.get(key) || 0) + 1);
    }
    const duplicated = [];
    for (const header of seen) {
      const key = foldHeader(header);
      if (times.get(key) > 1) {
        if (!duplicated.some((d) => foldHeader(d.header) === key)) {
          duplicated.push({ header, count: times.get(key),
            field: byHeader.get(key) || null });
        }
        continue;
      }
      if (byHeader.has(key)) mapped.push({ header, field: byHeader.get(key) });
      else if (ignored.has(key)) ignoredHere.push(header);
      else unread.push(header);
    }
    const present = new Set(mapped.map((m) => m.field));
    /* Declared by the template but absent from this file — a template pointed at
       the wrong export, or an export that changed. */
    const missing = Object.entries(columns)
      .filter(([field, header]) => text(header) && !present.has(field))
      .map(([field, header]) => ({ field, header }));
    return { mapped, ignored: ignoredHere, unread, duplicated, missing };
  }

  /* One source row to one normalized record, or a refusal that says why.
     `row` is an array of strings as parsed; `headers` names its columns. */
  function normalize(row, headers, { at = null } = {}) {
    const cells = new Map();
    const seen = Array.isArray(headers) ? headers : [];
    /* A field whose column appears twice is not read at all — see `columnsFor`.
       Silently taking one of them is the thing this refuses to do. */
    const duplicated = new Set();
    const times = new Map();
    for (const header of seen) {
      const key = foldHeader(header);
      times.set(key, (times.get(key) || 0) + 1);
    }
    for (const [key, n] of times) if (n > 1 && byHeader.has(key)) duplicated.add(byHeader.get(key));
    seen.forEach((header, index) => {
      const field = byHeader.get(foldHeader(header));
      if (field && !duplicated.has(field)) cells.set(field, Array.isArray(row) ? row[index] : undefined);
    });

    const source = {
      at,
      rowId: text(cells.get("sourceRowId")) || null,
      portfolio: text(cells.get("portfolio")) || null,
    };
    const bad = (reason, detail, field = null) =>
      ({ ok: false, invalid: { reason, detail, field }, source });

    if (duplicated.size) {
      const fields = [...duplicated].sort();
      return bad(INVALID.duplicateColumn,
        `the file has more than one column for ${fields.join(", ")}; MetYet will not choose one`,
        fields[0]);
    }

    /* IDENTITY FIRST, AND WITHOUT IT NOTHING ELSE MATTERS. A row that cannot say
       which card it is about is not a card MetYet does not have — it is a row
       that has not said. The three are the minimum because they are what the
       catalog is keyed by. */
    const cardName = text(cells.get("cardName"));
    const expansion = text(cells.get("expansion"));
    const collectorNumber = text(cells.get("collectorNumber"));
    for (const [field, value] of [["cardName", cardName], ["expansion", expansion],
      ["collectorNumber", collectorNumber]]) {
      if (!value) {
        return bad(INVALID.blankIdentity, `no ${field} — MetYet cannot tell which card this is`, field);
      }
      if (FORMULA.test(value)) {
        return bad(INVALID.formula, `${field} is a spreadsheet formula, not a card fact`, field);
      }
    }

    /* THE FIVE DIMENSIONS, EACH ONE EITHER STATED OR SILENT. A word the template
       has not been taught is refused by name. Silence is recorded AS silence and
       is never filled in with a default here — `withDefaults` would turn "the
       file did not say which printing" into "the ordinary printing", which is
       the single most dangerous guess this tool could make. What silence means
       is the catalog's business, decided in `resolve.js` where the printings
       that actually exist can be counted. */
    const dimensions = {};
    for (const field of DIMENSIONS) {
      const raw = cells.get(field);
      const value = text(raw);
      if (!value) continue;
      if (FORMULA.test(value)) {
        return bad(INVALID.formula, `${field} is a spreadsheet formula`, field);
      }
      const mapped = WORDS[field][foldValue(value)];
      const word = mapped !== undefined ? mapped : value;
      if (!CI.knownVocabulary({ [field]: word })) {
        return bad(INVALID.unknownWord,
          `${field} says "${value}", which no template has translated into a MetYet word`, field);
      }
      dimensions[field] = word;
    }

    /* THE COPY. Quantity, then money, then the grading pair — in that order
       because each refusal should name the first thing wrong with the row rather
       than the last. */
    const quantity = readQuantity(cells.get("quantity"));
    if (quantity.bad) {
      return bad(quantity.bad, `quantity says "${text(cells.get("quantity"))}"`, "quantity");
    }

    const money = {};
    for (const field of ["ask", "cost"]) {
      const amount = readMoney(cells.get(field));
      if (amount.bad) {
        return bad(amount.bad, `${field} says "${text(cells.get(field))}", which is not an amount`, field);
      }
      if (amount.stated) money[field] = amount.amount;
    }

    const graded = readGrade({
      grade: cells.get("grade"),
      gradingCompany: cells.get("gradingCompany"),
      numericGrade: cells.get("numericGrade"),
    }, WORDS.grade);
    if (graded.bad) {
      const said = graded.was ? `"${graded.was}"` : "nothing usable";
      return bad(graded.bad,
        graded.detail || (graded.bad === INVALID.ungradeable
          ? `grade says ${said}; MetYet holds Raw and PSA 1–10 and no other grade`
          : `grade says ${said}`), "grade");
    }

    let condition = null;
    const rawCondition = text(cells.get("condition"));
    if (rawCondition) {
      if (FORMULA.test(rawCondition)) {
        return bad(INVALID.formula, "condition is a spreadsheet formula", "condition");
      }
      const mapped = WORDS.condition[foldValue(rawCondition)];
      const word = mapped !== undefined ? mapped : rawCondition;
      if (!D.CONDITION_VALUES.includes(word)) {
        return bad(INVALID.unknownWord,
          `condition says "${rawCondition}", which no template has translated into a MetYet word`,
          "condition");
      }
      condition = word;
    }

    /* The copy as the domain will judge it, judged HERE first so the founder
       sees "a PSA 9 cannot also be Lightly Played" in a preview rather than a
       refusal code from a write. Asked of the domain itself, so the two can
       never disagree. */
    const copy = {};
    if (graded.stated) copy.grade = graded.grade;
    if (condition) copy.condition = condition;
    const cert = text(cells.get("cert"));
    if (cert) {
      if (FORMULA.test(cert)) return bad(INVALID.formula, "cert is a spreadsheet formula", "cert");
      /* A CERTIFICATE NUMBER IS A CLAIM ABOUT A SLAB (Phase 5 C8, corrected).
         The domain does not check it — `gradingProblem` never looks at `cert` —
         so an earlier draft wrote a certification number onto raw cards and onto
         cards with no grade at all, and nothing anywhere noticed. A cert without
         a grade is a graded card MetYet has not been told the grade of, which is
         a worse record than no cert. */
      if (!graded.stated) {
        return bad(INVALID.certWithoutGrade,
          `a certificate number with no grade — a cert identifies a graded slab`, "cert");
      }
      if (/^raw$/i.test(graded.grade)) {
        return bad(INVALID.certWithoutGrade,
          `a certificate number on a card marked Raw`, "cert");
      }
      /* AND A CERT IS ONE SLAB. A row that says "three of these, cert 70551202"
         is describing one certified card and two others, and writing the same
         cert onto all three is a fabricated certification on two real cards. */
      if (quantity.quantity > 1) {
        return bad(INVALID.certForMany,
          `${quantity.quantity} copies sharing one certificate number — a cert identifies one slab`,
          "cert");
      }
      copy.cert = cert;
    }
    if (money.ask !== undefined) copy.ask = money.ask;
    if (money.cost !== undefined) copy.cost = money.cost;
    const problem = D.gradingProblem(copy);
    if (problem) {
      return bad(INVALID.gradingIncoherent,
        `${problem} — MetYet reads a raw card's condition and a graded card's grade, never both`,
        "grade");
    }

    return {
      ok: true,
      record: {
        identity: { cardName, expansion, collectorNumber, dimensions },
        copy,
        quantity: quantity.quantity,
        source,
      },
    };
  }

  return {
    template: Object.freeze({
      name: template.name,
      provisional: template.provisional === true,
      note: text(template.note) || null,
    }),
    columnsFor,
    normalize,
  };
}

/* The only keys that may reach an inventory copy. `addInventoryCopy` does not
   whitelist its input, so this is the whitelist. */
const COPY_KEYS = Object.freeze(["grade", "condition", "cert", "ask", "cost"]);

module.exports = {
  parseCsv, createMapper, checkTemplate, COPY_KEYS,
  FIELDS, IDENTITY_FIELDS, COPY_FIELDS, CONTEXT_FIELDS, DIMENSIONS, INVALID,
  foldHeader, foldValue,
};
