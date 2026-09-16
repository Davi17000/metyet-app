/* ============================================================================
   PRESENTING WHAT THE SERVER SENT — FORMATTING, AND NOTHING ELSE

   Pure functions over projected records. No React, no store, no domain, no
   network. Every one of them takes a value the server put in the projection
   and returns something a person can read.

   THE RULE THAT SHAPES ALL OF IT: a missing value is missing. Nothing here
   substitutes a plausible default, a zero, a date, or a nearest-match label.
   `null` comes back, and the caller renders nothing rather than a guess — which
   is why the fact components take `null` as "do not render this line" instead
   of as "render an empty one".

   THE SECOND RULE: a label is presentation, a mapping is not. `stageLabel`
   turns "agree-price" into "Agree on Price" because that is the product's own
   word for a value the SERVER chose. A stage this build has never seen comes
   back as itself — never as the nearest known stage, because coercing it would
   quietly tell a Trusted Partner that a deal is somewhere it is not.
   ========================================================================== */

/* Only arrays, only truthy rows. A projection missing a collection entirely —
   an older server, a narrowed projection — is an ordinary case, not a crash. */
export const rows = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

/* A map from id to record, for joining by EXPLICIT identifier. Every join in
   this product is by the id a row carries; nothing is matched by position,
   because row order is not a fact the server promised. */
export const indexById = (list) => {
  const out = new Map();
  for (const row of rows(list)) if (row.id != null) out.set(row.id, row);
  return out;
};

/* Counting rows by the id they carry. A count is reading; a rule is not. */
export const countBy = (list, key) => {
  const out = new Map();
  for (const row of rows(list)) {
    const id = row[key];
    if (id != null) out.set(id, (out.get(id) || 0) + 1);
  }
  return out;
};

/* Grouping, same principle. */
export const groupBy = (list, key) => {
  const out = new Map();
  for (const row of rows(list)) {
    const id = row[key];
    if (id == null) continue;
    if (!out.has(id)) out.set(id, []);
    out.get(id).push(row);
  }
  return out;
};

export const text = (value) =>
  (typeof value === "string" && value.trim() ? value.trim() : null);

/* Money the server stated. Never a sum, a difference or a margin of two of
   them: this product does not compute profit, and a number nobody sent is not
   a number to show. */
export const money = (value) => (typeof value === "number" && Number.isFinite(value)
  ? "$" + Math.round(value).toLocaleString("en-US") : null);

/* Dates arrive as ISO days or timestamps. The day is what a person reads. */
export const day = (value) => {
  const raw = text(value);
  if (!raw) return null;
  const iso = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : raw;
};

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------ CARD IDENTITY

   Enough of a catalogue entry to tell one physical copy from another. All of
   it is projected; none of it is computed. A card the projection does not
   contain yields nulls, and the row still renders — an inventory copy whose
   catalogue entry did not arrive is still a copy the Trusted Partner owns. */

export const cardTitle = (card) => (card ? text(card.name) : null);

export const cardSetLine = (card) => (card
  ? [text(card.set), text(card.num), card.year ? String(card.year) : null].filter(Boolean).join(" · ") || null
  : null);

/* RAW vs GRADED, as the catalogue states it and not as we infer it. `grade`
   carries either a grading label ("PSA 9") or the word "Raw"; `condition` is
   the raw qualifier ("Near Mint") and is null for a graded copy. A card with
   neither yields null, and nothing is shown. */
export const gradeLine = (card) => {
  if (!card) return null;
  const grade = text(card.grade);
  const condition = text(card.condition);
  if (grade && /^raw$/i.test(grade)) return condition ? `Raw · ${condition}` : "Raw";
  if (grade) return grade;
  return condition || null;
};

export const isGraded = (card) => {
  const grade = text(card && card.grade);
  return Boolean(grade) && !/^raw$/i.test(grade);
};

/* The printing details, each shown only when the catalogue carried it. */
export const cardMarks = (card) => (card
  ? [text(card.edition), text(card.print), text(card.language)].filter(Boolean)
  : []);

/* ---------------------------------------------------------------- LABELS */

/* Canonical stage ids with the product's own words. Presentation for a value
   the SERVER decided — no order, no transition and no rule is expressed here. */
export const STAGE_LABEL = Object.freeze({
  "agree-price": "Agree on Price",
  "select-trade": "Select Trade",
  "value-trade": "Value Trade",
  deal: "Deal",
  fulfillment: "Fulfillment",
  completed: "Completed",
});

/* A stage this build has never seen is shown AS ITSELF. Mapping it to the
   nearest known stage would tell a Trusted Partner a deal is somewhere it is
   not, which is worse than an unfamiliar word. */
export const stageLabel = (stage) => {
  const raw = text(stage);
  if (!raw) return null;
  return STAGE_LABEL[raw] || raw;
};
export const isKnownStage = (stage) =>
  Object.prototype.hasOwnProperty.call(STAGE_LABEL, text(stage) || "");

/* The same principle for a copy's status, which is also the server's answer. */
export const STATUS_LABEL = Object.freeze({
  available: "Available",
  committed: "Committed",
  reserved: "Reserved",
  sold: "Sold",
  traded: "Traded",
  unavailable: "Unavailable",
});
export const statusLabel = (status) => {
  const raw = text(status);
  if (!raw) return null;
  return STATUS_LABEL[raw] || raw;
};

export const TIER_LABEL = Object.freeze({ primary: "Primary goal", secondary: "Secondary goal" });
export const tierLabel = (tier) => {
  const raw = text(tier);
  if (!raw) return null;
  return TIER_LABEL[raw] || raw;
};

/* Most recent first, by a date the server sent. Sorting by a DATE rather than
   by lifecycle position is deliberate: an unfamiliar stage has no position in
   an order this build knows, and inventing one for it would be the same
   coercion `stageLabel` refuses. Rows with no date keep their arrival order,
   after the dated ones. */
export const byRecency = (list, ...fields) => {
  const when = (row) => {
    for (const f of fields) { const d = day(row && row[f]); if (d) return d; }
    return null;
  };
  return rows(list)
    .map((row, i) => ({ row, i, at: when(row) }))
    .sort((a, b) => {
      if (a.at && b.at) return a.at === b.at ? a.i - b.i : (a.at < b.at ? 1 : -1);
      if (a.at) return -1;
      if (b.at) return 1;
      return a.i - b.i;
    })
    .map((x) => x.row);
};
