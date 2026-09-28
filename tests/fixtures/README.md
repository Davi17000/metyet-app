# Test fixtures

## `collectr-provisional.csv` — ⚠ SYNTHETIC AND PROVISIONAL

**This is not a Collectr export. It was written by us, from the outside, to
exercise MetYet's inventory mapping contract.**

Specifically:

- **The headers are a guess.** No claim is made that `Set Code`, `Card Number`,
  `Grader`, `Listed Price` or any other column name matches Collectr's current
  schema, or ever did. They were invented to be a plausible shape, not a
  reported one.
- **No row is real data.** Every card, price, cert number and collection name
  here was made up. Nothing was taken from any account, any export, or any
  third-party dataset, and nothing was scraped.
- **No Collectr-specific behaviour is encoded anywhere.** The template that
  reads this file (`server/inventory/templates.js` →
  `collectr-provisional`) is configuration: column names and word translations.
  If the real export turns out to be shaped differently, the template changes
  and nothing else does. That is the property this fixture exists to prove.

**What it is for.** Each row exercises one thing the mapping contract has to get
right. Against a fully stocked catalog **15 of the 22 rows are meant to fail** —
that is the point of the file, not a defect in it. The `Item ID` column is what
the table below names; the file line is one greater than the row's position
because of the header.

| Item ID | file line | what it exercises |
|---|---|---|
| 0001 | 2 | a certified slab: PSA grade, cert number, money with a currency symbol and thousands separators |
| 0002, 0004, 0006 | 3, 5, 7 | raw cards with a condition, blank optional fields |
| 0003 | 4 | quantity > 1 (two PSA 8s, deliberately with **no** cert — see 0021) |
| **0005** | **6** | **ambiguous**: no edition stated for a card with three printings |
| 0007–0008 | 8, 9 | **unresolved**: a release the catalog does not hold; a card it does not hold |
| 0009–0010 | 10, 11 | insufficient identity — no card name; no collector number |
| 0011 | 12 | a grade MetYet cannot express at all (`BGS 9.5`) |
| 0012, 0019, 0020 | 13, 20, 21 | source words nobody has translated: a foil, a language, a condition |
| 0013–0014 | 14, 15 | malformed numbers: a price in words; a quantity of zero |
| 0015 | 16 | a graded card that also carries a raw condition |
| 0016 | 17 | a spreadsheet formula where a value belongs |
| 0017 | 18 | quoting: a comma and an apostrophe inside a card name |
| 0018 | 19 | a repeated card, three copies |
| 0021 | 22 | one certificate number claimed by two copies — a cert identifies one slab |
| 0022 | 23 | a certificate number on a card marked Raw |

**Justin's real export is the adversarial specimen.** When it arrives it should
be run against this contract *as it is* — not cleaned up to fit. What it breaks
is the finding.
