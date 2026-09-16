/* ============================================================================
   GOALS — WHAT YOU'RE LOOKING FOR, AND WHAT IS HAPPENING ABOUT IT

   A goal is a card you want, and in MetYet it is the ONLY way a deal starts.
   So this is the one section where coordination shows up — not as a separate
   product, but as something happening to a goal you already had.

   THE COORDINATION JOIN, STATED EXACTLY. An opportunity row carries `goalId`.
   Every opportunity shown under a goal is one whose `goalId` equals that goal's
   `id` — `groupBy(state.opportunities, "goalId")`, and nothing else. Not the
   card, not the order, not a date. A goal with no opportunity naming it shows
   none; an opportunity naming a goal the projection does not contain is not
   attached to a different one.

   WHAT IS READ FROM IT, AND WHAT IS NOT. The stage the server set, rendered
   with the product's own words and marked when this build does not know it. The
   partner it is with, by explicit `partnerId`. The prices the server stated.
   Nothing is inferred: not from the order of a price thread, not from which
   fields are filled, not from timestamps. `priceThread`, `trade`, `deal` and
   `fulfillment` all arrive in the projection and none of them is opened here —
   reading them would mean re-deriving a lifecycle the server already decided.

   THERE IS NO OPPORTUNITIES SECTION, and this is why: a deal is a goal being
   worked. Giving it its own navigation would make it a second workflow, and the
   product has one.
   ========================================================================== */

import React from "react";
import { Panel, Record, Fact, Tag } from "../parts.jsx";
import { rows, indexById, groupBy, text, day, money, plural, cardTitle, cardSetLine,
  gradeLine, cardMarks, stageLabel, isKnownStage, tierLabel, byRecency } from "../present.js";

export default function Goals({ state }) {
  const goals = rows(state && state.goals);
  const catalog = indexById(state && state.catalog);
  /* Every join below is by an id the row carries. */
  const oppsByGoal = groupBy(state && state.opportunities, "goalId");
  const partnerName = new Map();
  for (const p of rows(state && state.partners)) {
    if (p.id != null) partnerName.set(p.id, text(p.name));
  }
  for (const p of rows(state && state.counterparties)) {
    if (p.id != null && !partnerName.has(p.id)) partnerName.set(p.id, text(p.name));
  }

  const ordered = byRecency(goals, "since", "createdAt");

  return (
    <Panel
      title="What you're looking for"
      note={goals.length ? plural(goals.length, "goal", "goals") : null}
      empty={goals.length ? null
        : "You haven't set any goals yet. A goal is a card you want — it's how your Trusted "
          + "Partners know what to look out for, and it's where every deal starts."}
    >
      {ordered.map((goal) => {
        const card = catalog.get(goal.cardId) || null;
        const grade = gradeLine(card);
        const sub = [cardSetLine(card), grade].filter(Boolean).join(" · ") || null;
        /* Only the opportunities that name THIS goal. */
        const working = byRecency(oppsByGoal.get(goal.id) || [], "updated", "completedAt");

        return (
          <Record
            key={goal.id}
            title={cardTitle(card) || "A card that isn't in your catalogue"}
            subtitle={sub}
            marks={cardMarks(card)}
            tags={<Tag tone={goal.tier === "primary" ? "strong" : null}>{tierLabel(goal.tier)}</Tag>}
            note={text(goal.note)}
            noteLabel="Your note"
            facts={
              <>
                <Fact label="Wanted since" value={day(goal.since)} />
                <Fact label="Confirmed" value={day(goal.confirmedAt)} />
              </>
            }
          >
            {working.length ? (
              <ul className="mcs-sub">
                {working.map((o) => {
                  const known = isKnownStage(o.stage);
                  const who = partnerName.get(o.partnerId);
                  return (
                    <li key={o.id}>
                      <Tag tone={known ? "strong" : "unknown"}>{stageLabel(o.stage)}</Tag>
                      {known ? null : <Tag>not a step this version knows</Tag>}
                      {who ? <span className="mcs-sub-t">with {who}</span> : null}
                      <span className="mcs-sub-f">
                        <Fact label="Listed" value={money(o.listedPrice)} />
                        <Fact label="Agreed" value={money(o.agreedPrice)} />
                        <Fact label="Last moved" value={day(o.updated)} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </Record>
        );
      })}
    </Panel>
  );
}
