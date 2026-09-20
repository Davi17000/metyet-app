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

   ---------------------------------------------------------------------------
   AND NOW THE PART THAT COMES BEFORE ANY OF THAT (Phase 5 Batch 8).

   Until this batch a Trusted Partner with nothing in progress saw an empty
   screen — true, and useless, because the thing that would have made it not
   empty was sitting in two records nobody had put side by side. READY TO
   COORDINATE is those two records: a collector in your network has said they
   want one exact card, and one exact card on your shelf is that card.

   IT IS NOT A MATCH SCORE AND IT IS NOT A LEAD. The server computed it from an
   equality on a canonical card id inside an accepted relationship, and there is
   nothing to tune: every row is the same strength of true. Nothing is ranked,
   nothing is recommended, and no stranger appears — a collector who is not in
   your network is not in this projection at all.

   IT RESERVES NOTHING. Two collectors wanting the same card produce two rows
   over the same copies, and neither takes anything from the other. A copy is
   only ever spoken for by a deal, which is what the lists below are.

   AND IT IS NOT AN OPPORTUNITY YET. An Opportunity begins when a collector
   makes an offer; this is the moment before, which is why it is a separate
   panel with its own word rather than a row in "In progress" wearing a stage
   it has not reached.
   ========================================================================== */

import React, { useEffect, useState } from "react";
import { Panel, Record, Fact, Tag } from "../parts.jsx";
import { rows, indexById, text, day, money, plural, cardTitle, cardSetLine,
  gradeLine, stageLabel, isKnownStage, tierLabel, supplyLine, byRecency } from "../present.js";

const COMPLETED = "completed";

export default function Opportunities({ state, onBrowseCards = null }) {
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

  /* READY TO COORDINATE — the server's overlaps, minus the ones already being
     worked. A discovery names the Goal it came from; a live deal names the Goal
     it is for. Where those are the same Goal and the same collector, the deal
     is the truer statement and the discovery would only repeat it. */
  const working = new Set(live.map((o) => `${o.goalId}::${o.partnerId}`));
  const ready = rows(state && state.discoveries).filter((d) => !working.has(d.key));

  /* WHAT EACH ONE IS, ASKED FOR ONCE. The ids are in this projection already;
     the names are not, and a row that cannot say which card it is about is a
     row a person cannot act on. One request for the set — never one per row,
     and never the catalogue. */
  const readyIds = [...new Set(ready.map((d) => d.canonicalCardId).filter(Boolean))];
  const [named, setNamed] = useState({});
  useEffect(() => {
    if (!onBrowseCards || !readyIds.length) return undefined;
    let current = true;
    (async () => {
      try {
        const answer = await onBrowseCards.describe(readyIds);
        if (!current) return;
        const next = {};
        for (const card of rows(answer && answer.cards)) next[card.canonicalCardId] = card;
        setNamed((held) => ({ ...held, ...next }));
      } catch (error) { /* an unnamed card is still a card you have */ }
    })();
    return () => { current = false; };
  }, [readyIds.join(","), onBrowseCards]);

  const overlap = (d) => {
    const card = named[d.canonicalCardId] || null;
    const sub = card
      ? [card.expansionName, card.collectorNumber ? `#${card.collectorNumber}` : null]
        .filter(Boolean).join(" · ") || null
      : null;
    return (
      <Record
        key={d.key}
        title={(card && card.cardName) || "A card MetYet is still describing"}
        subtitle={sub}
        tags={
          <>
            <Tag tone="strong">On your shelf</Tag>
            {d.tier ? <Tag>{tierLabel(d.tier)}</Tag> : null}
          </>
        }
        note={supplyLine(who.get(d.collectorId), d.tier, d.copies)}
        noteLabel="Why you're seeing this"
        facts={<Fact label="Your copies" value={d.copies ? String(d.copies) : null} mono />}
      />
    );
  };

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
      {ready.length ? (
        <Panel title="Ready to coordinate"
          note={plural(ready.length, "card", "cards")}>
          {ready.map(overlap)}
        </Panel>
      ) : null}

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
