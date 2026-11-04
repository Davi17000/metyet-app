/* ============================================================================
   WHERE A DEAL IS ON THE JOURNEY — A LABEL FOR THE SERVER'S STAGE (Milestone 2B)

   The founder describes a deal as ten steps, from Market Validation to
   Completion Confirmation. The domain holds five negotiation stages and a
   completed one (`D.STAGES`). They are not the same list, and this file is the
   one written-down mapping between them, so no screen invents its own.

     canonical stage   journey steps
     agree-price       1   Market Validation
     select-trade      2   Select Trade (the founder's "Trade Offer";
                           named as the stage, consistently — Milestone 2C)
     value-trade       3–4 Trade Market Validation, Trade %
     deal              5–7 Final Cash Difference, Final Adjustment,
                           Review & Confirmation
     fulfillment       8–9 Meetup Coordination, Finalized Deal Summary
     completed         10  Completion Confirmation

   WHAT IT DOES NOT DO. Where one stage covers several steps the domain does
   not say which of them a deal is on, so this never picks one: the current
   position is the whole range. Nothing is inferred from time, from the price
   thread or from which fields happen to be filled. A stage this build has
   never seen gets no bar at all — it is shown as itself, as `stageLabel` does.

   WHAT IS AVAILABLE. Production lets a Collector act on step 1 only; every
   later step is planned, never offered. `AVAILABLE_THROUGH` is that fact, and
   a step past it is drawn as "not yet available", never as something to do.

   It decides nothing about the deal. Whose move it is, and what may be
   pressed, still come from the server's `turn` through `negotiation.jsx`.
   ========================================================================== */

import { text } from "./present.js";

export const JOURNEY = Object.freeze([
  "Market Validation",
  "Select Trade",
  "Trade Market Validation",
  "Trade %",
  "Final Cash Difference",
  "Final Adjustment",
  "Review & Confirmation",
  "Meetup Coordination",
  "Finalized Deal Summary",
  "Completion Confirmation",
]);

/* Canonical stage -> the journey steps it covers (1-based, inclusive). */
export const STAGE_JOURNEY = Object.freeze({
  "agree-price": Object.freeze({ first: 1, last: 1 }),
  "select-trade": Object.freeze({ first: 2, last: 2 }),
  "value-trade": Object.freeze({ first: 3, last: 4 }),
  deal: Object.freeze({ first: 5, last: 7 }),
  fulfillment: Object.freeze({ first: 8, last: 9 }),
  completed: Object.freeze({ first: 10, last: 10, complete: true }),
});

/* The last journey step production lets a Collector act on. */
export const AVAILABLE_THROUGH = 1;

/* The domain's own name for the stage after an agreed price, which is what a
   Collector is told comes next. */
export const NEXT_PLANNED_STAGE = Object.freeze({ "select-trade": "Select Trade" });

const own = (o, k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k);

/* null for no deal; `known: false` for a stage this build has never seen. */
export function dealProgress(deal) {
  if (!deal) return null;
  const stage = text(deal.stage);
  if (!own(STAGE_JOURNEY, stage)) return { known: false, stage, total: JOURNEY.length };
  const { first, last } = STAGE_JOURNEY[stage];
  const completed = STAGE_JOURNEY[stage].complete === true;
  const done = completed ? JOURNEY.length : first - 1;
  const steps = JOURNEY.map((label, i) => {
    const n = i + 1;
    const state = n <= done ? "done"
      : n >= first && n <= last ? "current"
        : "later";
    return { n, label, state, available: n <= AVAILABLE_THROUGH };
  });
  const range = first === last ? `Step ${first}` : `Steps ${first}–${last}`;
  const names = JOURNEY.slice(first - 1, last).join(", ");
  return {
    known: true,
    stage,
    total: JOURNEY.length,
    done,
    first,
    last,
    steps,
    /* Whether a Collector can act on where this deal now is. */
    available: !completed && first <= AVAILABLE_THROUGH,
    label: completed ? "Completed" : `${range} of ${JOURNEY.length} · ${names}`,
    /* The stage's own name, without the step count (Milestone 2C.1). */
    name: completed ? "Completed" : names,
    /* The last finished step, said plainly when there is one. */
    finished: done > 0 && !completed ? `${JOURNEY[done - 1]} complete` : null,
    next: NEXT_PLANNED_STAGE[stage] || null,
  };
}
