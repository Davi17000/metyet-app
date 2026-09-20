/* ============================================================================
   PRESENTING WHAT THE SERVER SENT — FORMATTING, AND NOTHING ELSE

   Pure functions over a projected Collector state. No React, no store, no
   domain, no network. Every one takes a value the server put in the projection
   and returns something a person can read.

   WHY THIS IS NOT `client/tp/present.js`. The Trusted Partner workspace has its
   own copy of a handful of these. Sharing them would mean one of the two
   applications importing from the other's folder, and a test in each direction
   says neither may — a boundary worth more than five small functions. When a
   third consumer appears, the shared ones move somewhere neutral; two is not
   yet a pattern.

   THE RULE THAT SHAPES ALL OF IT: a missing value is missing. Nothing here
   substitutes a plausible default, a zero, a date or a nearest-match label.
   `null` comes back and the caller renders nothing, which is why the fact
   components treat `null` as "do not draw this line" rather than "draw an
   empty one".

   THE SECOND RULE: a label is presentation, a mapping is not. `stageLabel`
   turns "agree-price" into "Agree on Price" because that is the product's own
   word for a value the SERVER chose. A stage this build has never seen comes
   back as itself — never as the nearest known stage, because coercing it would
   tell a Collector their deal is somewhere it is not.

   THE THIRD RULE: every join is by an explicit id the row carries. Row order is
   not a fact the server promised, and a missing related row yields nothing
   rather than the nearest one.
   ========================================================================== */

export const rows = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

/* id -> record, for joining by the identifier a row carries. */
export const indexById = (list) => {
  const out = new Map();
  for (const row of rows(list)) if (row.id != null) out.set(row.id, row);
  return out;
};

/* Rows grouped by the id under one named key. Used for "the opportunities that
   name THIS goal" and "the partners interested in THIS copy" — both explicit. */
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

export const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);

/* Money the server stated, never a sum or a difference of two of them. */
export const money = (value) => (typeof value === "number" && Number.isFinite(value)
  ? "$" + Math.round(value).toLocaleString("en-US") : null);

export const day = (value) => {
  const raw = text(value);
  if (!raw) return null;
  const iso = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : raw;
};

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------ CARD IDENTITY

   Enough of a catalogue entry to tell one card from another. All projected,
   none computed. A card the projection does not contain yields nulls and the
   row still renders — it is still the Collector's goal or their copy. */

export const cardTitle = (card) => (card ? text(card.name) : null);

export const cardSetLine = (card) => (card
  ? [text(card.set), text(card.num), card.year ? String(card.year) : null].filter(Boolean).join(" · ") || null
  : null);

/* RAW vs GRADED as the catalogue states it: `grade` carries a grading label or
   the word "Raw", and `condition` is the raw qualifier. Neither is inferred
   from the other. */
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

export const cardMarks = (card) => (card
  ? [text(card.edition), text(card.print), text(card.language)].filter(Boolean) : []);

/* Photo references, not URLs — `binder:t15:front` names a picture the product
   does not yet serve. So this reports WHETHER there are pictures, in words,
   and never pretends to show one. */
export const photoNote = (photos) => {
  if (!photos || typeof photos !== "object") return null;
  const has = ["front", "back"].filter((side) => text(photos[side]));
  if (!has.length) return null;
  return has.length === 2 ? "Front and back" : (has[0] === "front" ? "Front only" : "Back only");
};

/* ---------------------------------------------------------------- LABELS */

/* Canonical stage ids with the product's own words. Presentation for a value
   the SERVER decided; no order, no transition and no rule is expressed here. */
export const STAGE_LABEL = Object.freeze({
  "agree-price": "Agreeing a price",
  "select-trade": "Choosing what to trade",
  "value-trade": "Valuing the trade",
  deal: "Agreeing the deal",
  fulfillment: "Handing it over",
  completed: "Done",
});

/* A stage this build has never seen is shown AS ITSELF. */
export const stageLabel = (stage) => {
  const raw = text(stage);
  if (!raw) return null;
  return STAGE_LABEL[raw] || raw;
};
export const isKnownStage = (stage) =>
  Object.prototype.hasOwnProperty.call(STAGE_LABEL, text(stage) || "");

/* A binder copy's status is the server's answer, carried on the row. */
export const STATUS_LABEL = Object.freeze({
  available: "Available",
  reserved: "Reserved",
  committed: "Committed",
  traded: "Traded",
  unavailable: "Unavailable",
});
export const statusLabel = (status) => {
  const raw = text(status);
  if (!raw) return null;
  return STATUS_LABEL[raw] || raw;
};

export const TIER_LABEL = Object.freeze({ primary: "Primary", secondary: "Secondary" });

/* WHAT THE TWO WORDS MEAN, IN THE PRODUCT'S OWN VOICE (Phase 5 Batch 7).
   "Primary" and "Secondary" are the domain's names for them and stay exactly
   what they were; these are what a person is asked and what they are told
   back. Both are explicit demand — the difference is how hard somebody is
   looking, not whether they are. Neither is a preference, a filter or a guess,
   and there is deliberately no third thing between them. */
export const TIER_INTENT = Object.freeze({
  primary: "Actively hunting",
  secondary: "Keeping an eye out",
});
export const tierIntent = (tier) => TIER_INTENT[text(tier)] || null;
export const tierLabel = (tier) => {
  const raw = text(tier);
  if (!raw) return null;
  return TIER_LABEL[raw] || raw;
};

/* Most recent first, by a date the server sent. Sorting by a DATE rather than
   by lifecycle position is deliberate: an unfamiliar stage has no position in
   an order this build knows, and inventing one would be the same coercion
   `stageLabel` refuses. Rows with no date keep their arrival order, after the
   dated ones. */
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
