/* ============================================================================
   OPPORTUNITIES — WHAT YOU'RE COORDINATING, AND WHERE EACH ONE STANDS

   Goals are the only transaction workflow in MetYet, and an Opportunity is a
   Goal being worked. So every row here is read against the Goal it names and
   the Collector it belongs to, both found by the identifiers the row carries.

   THE STAGE IS THE SERVER'S, AND AN UNFAMILIAR ONE SURVIVES AS ITSELF. The
   five deal stages are labelled with the product's own words. A stage this
   build has never seen — a lifecycle the server grew after this bundle shipped
   — is rendered verbatim and marked as unfamiliar, never mapped to the nearest
   known stage. Telling a Trusted Partner that a deal is at "Deal" when the
   server said something else is worse than showing them a word they have to
   ask about.

   That is also why the list is ordered by DATE rather than by lifecycle
   position: an unfamiliar stage has no position in an order this build knows,
   and inventing one would be the same coercion by another route. Most recently
   moved first, using the `updated` the server sent.

   COMPLETED IS A SEPARATE LIST, not a filtered-out one. Work that is finished
   is still work you did, and hiding it entirely makes a quiet week look like an
   empty one. "Not completed" is the only lifecycle judgement made here, and it
   is a comparison against one canonical value rather than a stage order.

   THE COPY, WHEN THERE IS ONE, IS THE EXACT COPY. An opportunity that names an
   `invId` is bound to one physical card; its certificate and your cost for THAT
   copy are read from your own inventory row with that `invId`. An opportunity
   that names none — which is most of them before a price is agreed — shows
   none, rather than picking a copy of the same card that looks right.

   NOTHING HERE ACTS. No stage button, no negotiation control, no disabled
   affordance pretending to be one. Every action migrates later through
   authenticated POST /api/commands, and until it does, this screen reads.
   ========================================================================== */

import React from "react";
import { Panel, Record, Fact, Tag } from "../parts.jsx";
import { rows, indexById, text, day, money, plural, cardTitle, cardSetLine,
  gradeLine, stageLabel, isKnownStage, tierLabel, byRecency } from "../present.js";

const COMPLETED = "completed";

export default function Opportunities({ state }) {
  const all = rows(state && state.opportunities);
  const catalog = indexById(state && state.catalog);
  const goals = indexById(state && state.goals);

  /* Who the other party is, by explicit id. `collectors` is the network;
     `counterparties` is bare identity for somebody named by a record but not in
     it. Both are the server's, and neither is a directory to browse. */
  const who = new Map();
  for (const c of [...rows(state && state.collectors), ...rows(state && state.counterparties)]) {
    if (c.id != null && !who.has(c.id)) who.set(c.id, text(c.name) || text(c.short));
  }
  /* Your own copies, by the id an opportunity would name. */
  const copies = new Map();
  for (const copy of rows(state && state.inventory)) {
    if (copy.invId != null) copies.set(copy.invId, copy);
  }

  const live = byRecency(all.filter((o) => o.stage !== COMPLETED), "updated");
  const done = byRecency(all.filter((o) => o.stage === COMPLETED), "completedAt", "updated");

  const line = (o) => {
    const card = catalog.get(o.cardId) || null;
    const goal = o.goalId != null ? goals.get(o.goalId) || null : null;
    /* The EXACT copy this deal is bound to, or none. Never another copy of the
       same card, however plausible it would look. */
    const copy = o.invId != null ? copies.get(o.invId) || null : null;
    const known = isKnownStage(o.stage);
    const grade = gradeLine(card);
    const subtitle = [cardSetLine(card), grade].filter(Boolean).join(" · ") || null;

    return (
      <Record
        key={o.id}
        title={who.get(o.collectorId) || "A collector outside your network"}
        subtitle={cardTitle(card) ? `${cardTitle(card)}${subtitle ? ` — ${subtitle}` : ""}` : subtitle}
        tags={
          <>
            <Tag tone={known ? "strong" : "unknown"}>{stageLabel(o.stage)}</Tag>
            {known ? null : <Tag>not a stage this version knows</Tag>}
            {goal ? <Tag>{tierLabel(goal.tier)}</Tag> : null}
          </>
        }
        note={text(goal && goal.note)}
        noteLabel="Their goal"
        facts={
          <>
            <Fact label="Listed" value={money(o.listedPrice)} mono />
            <Fact label="Agreed" value={money(o.agreedPrice)} mono />
            {/* This copy's own cert and your own cost for it. */}
            <Fact label="Your copy" value={text(copy && copy.cert)} mono />
            <Fact label="Your cost" value={money(copy && copy.cost)} mono />
            <Fact label="Last moved" value={day(o.updated)} mono />
            <Fact label="Completed" value={day(o.completedAt)} mono />
          </>
        }
      />
    );
  };

  return (
    <>
      <Panel
        title="In progress"
        note={live.length ? plural(live.length, "opportunity", "opportunities") : null}
        empty={live.length ? null
          : (all.length
            ? "Nothing in progress. Everything you've coordinated is complete."
            : "Nothing in progress yet. An opportunity begins from a collector's goal.")}
      >
        {live.map(line)}
      </Panel>

      {done.length ? (
        <Panel title="Completed" note={plural(done.length, "opportunity", "opportunities")}>
          {done.map(line)}
        </Panel>
      ) : null}
    </>
  );
}
