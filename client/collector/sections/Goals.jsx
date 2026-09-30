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

   AND FOR THE SAME REASON, NEITHER IS THERE A "MATCHES" SECTION (Phase 5
   Batch 8). When a Trusted Partner you already know has the exact card a goal
   names, that is a fact about the goal, so it is shown on the goal — above the
   deals, because it is what comes before one. It arrives as `discoveries`, the
   server's own join of your goals against your partners' available copies; the
   row carries the `goalId` it belongs to and this screen joins on that and
   nothing else. No card is compared here, nothing is scored, nothing is
   recommended, and a partner having it reserves nothing: they still have it if
   somebody else wants it too.
   ========================================================================== */

import React, { useEffect, useMemo, useState } from "react";
import { Panel, Record, Fact, Tag } from "../parts.jsx";
import { rows, indexById, groupBy, text, day, money, plural, cardTitle, cardSetLine,
  gradeLine, cardMarks, stageLabel, isKnownStage, tierLabel, tierIntent, holdingLine,
  byRecency } from "../present.js";

export default function Goals({ state, onAddGoal = null, onSetPriority = null,
  onRemoveGoal = null, onBrowseCards = null }) {
  const goals = rows(state && state.goals);
  const catalog = indexById(state && state.catalog);
  /* Every join below is by an id the row carries. */
  const oppsByGoal = groupBy(state && state.opportunities, "goalId");
  /* WHO ALREADY HAS IT (Batch 8), on exactly the same terms. A discovery row
     carries the `goalId` it is about, so it lands under that goal and under no
     other one. Nothing here compares cards, and nothing here decides whether
     the overlap is real: the server did that, from your goals, your Trusted
     Partners' available copies and the relationships you have with them. This
     screen reads the answer and names the partner. */
  const foundByGoal = groupBy(state && state.discoveries, "goalId");

  /* WHAT "NO LONGER LOOKING" TAKES AWAY, SAID BESIDE THE BUTTON THAT DOES IT.

     A binder holds cards that mean something to their owner, and dropping a card's
     last state takes it out of every binder it is in — permanently, because
     nothing puts it back. On the specification panel that warning already
     exists; this is the other surface that can cause the same loss, and it does
     it in one click with no panel and no confirmation.

     READ, NEVER DECIDED, HERE. This screen does not change what happens and does
     not offer to keep the filing. It reads the same four states the domain reads
     and says what the click will do, so that a destructive consequence is not a
     surprise. Only ACTIVE binders are counted, because those are the ones the
     prune reaches and the only ones the person can see. */
  const activeBinders = new Set(rows(state && state.binders)
    .filter((b) => !b.archivedAt).map((b) => b.id));
  const filedIn = (canonicalCardId) => rows(state && state.binderEntries)
    .filter((e) => e.canonicalCardId === canonicalCardId && activeBinders.has(e.binderId)).length;
  const otherState = (goal) => goals.some((g) => g.id !== goal.id
      && g.canonicalCardId === goal.canonicalCardId)
    || rows(state && state.collectorCopies).some((c) => c.canonicalCardId === goal.canonicalCardId
      && (c.offered === true || c.keeping === true));
  const bindersLost = (goal) => {
    if (!goal || goal.canonicalCardId == null) return null;
    if (otherState(goal)) return null;
    const n = filedIn(goal.canonicalCardId);
    if (!n) return null;
    return n === 1
      ? "This is the only thing you've said about this card, so it comes out of the binder it's in."
      : `This is the only thing you've said about this card, so it comes out of all ${n} binders it's in.`;
  };
  const partnerName = new Map();
  for (const p of rows(state && state.partners)) {
    if (p.id != null) partnerName.set(p.id, text(p.name));
  }
  for (const p of rows(state && state.counterparties)) {
    if (p.id != null && !partnerName.has(p.id)) partnerName.set(p.id, text(p.name));
  }

  const ordered = byRecency(goals, "since", "createdAt");

  /* WHICH CARD EACH GOAL IS FOR (Batch 7). A Goal stores one thing about its
     card: the id the server minted. What a person reads is asked for in ONE
     request for the ids this screen already holds — never one per row, never
     the catalogue. A goal whose description has not arrived still renders,
     because it is still something you want. */
  const canonicalIds = useMemo(
    () => [...new Set(ordered.map((g) => g.canonicalCardId).filter(Boolean))],
    [ordered.map((g) => g.canonicalCardId).join(",")]);
  const [described, setDescribed] = useState({});
  useEffect(() => {
    if (!onBrowseCards || !canonicalIds.length) return undefined;
    let current = true;
    (async () => {
      try {
        const answer = await onBrowseCards.describe(canonicalIds);
        if (!current) return;
        const next = {};
        for (const card of rows(answer && answer.cards)) next[card.canonicalCardId] = card;
        setDescribed((held) => ({ ...held, ...next }));
      } catch (error) { /* a list without captions is still a list */ }
    })();
    return () => { current = false; };
  }, [canonicalIds.join(","), onBrowseCards]);

  const [busy, setBusy] = useState(null);

  /* Changing your mind, and changing it back. Neither touches which card the
     goal is for — there is no card in what goes out. */
  const flip = async (goal) => {
    if (!onSetPriority || busy) return;
    setBusy(goal.id);
    try { await onSetPriority(goal.id, goal.tier === "primary" ? "secondary" : "primary"); }
    catch (error) { /* the store carries the failure; the row stays as it was */ }
    finally { setBusy(null); }
  };
  const drop = async (goal) => {
    if (!onRemoveGoal || busy) return;
    setBusy(goal.id);
    try { await onRemoveGoal(goal.id); }
    catch (error) { /* likewise */ }
    finally { setBusy(null); }
  };

  return (
    <>
    {/* ADDING A CARD MOVED TO BROWSE (Phase 5 C1). It used to happen here,
        through a search box and a flat list that was a hundred and ten lines
        identical to the Trusted Partner's. Both are now the one card browser,
        and the place a person finds a card is the place they say they want it
        — which leaves this screen to be what it is: the list, and what has
        happened to it. */}
    <Panel
      title="What you're looking for"
      note={goals.length ? plural(goals.length, "goal", "goals") : null}
      empty={goals.length ? null
        : "You haven't set any goals yet. A goal is a card you want — it's how your Trusted "
          + "Partners know what to look out for, and it's where every deal starts."}
    >
      {ordered.map((goal) => {
        /* A goal names its card one way or the other: the server's description
           of a canonical card, or the demo catalogue's own row. */
        const known = goal.canonicalCardId ? described[goal.canonicalCardId] : null;
        const card = goal.canonicalCardId ? null : (catalog.get(goal.cardId) || null);
        const sub = known
          ? [known.expansionName, known.collectorNumber ? `#${known.collectorNumber}` : null]
            .filter(Boolean).join(" · ") || null
          : [cardSetLine(card), gradeLine(card)].filter(Boolean).join(" · ") || null;
        /* Only the opportunities that name THIS goal. */
        const working = byRecency(oppsByGoal.get(goal.id) || [], "updated", "completedAt");
        /* Likewise, only the overlaps that name THIS goal — and only the ones
           for a partner no deal on this goal is already under way with, so the
           same person is not both "has this card" and "you're mid-negotiation
           with them about it". Other partners still show: a negotiation with
           one of them does not make the others stop having the card. */
        const busyWith = new Set(working.map((o) => o.partnerId));
        const found = (foundByGoal.get(goal.id) || []).filter((d) => !busyWith.has(d.partnerId));

        return (
          <Record
            key={goal.id}
            title={(known && known.cardName) || cardTitle(card)
              || (goal.canonicalCardId ? "Loading this card…" : "A card that isn't in your catalogue")}
            subtitle={sub}
            marks={known
              ? [known.finish, known.printRun, known.language].filter(Boolean)
              : cardMarks(card)}
            tags={
              <Tag tone={goal.tier === "primary" ? "strong" : null}>
                {tierIntent(goal.tier) || tierLabel(goal.tier)}
              </Tag>}
            note={text(goal.note)}
            noteLabel="Your note"
            facts={
              <>
                {/* "WANTED SINCE" READ THE WRONG FIELD, AND SAID A FALSE DATE.

                    `goal.since` means "in this tier since" — `updateGoalTier`
                    overwrites it on every promotion and demotion — so after a
                    Goal moved to Primary this screen showed the promotion date
                    as the day the person started wanting the card. `createdAt`
                    is the honest answer and was rendered nowhere. The durable
                    timestamps are untouched; only the reading changed.

                    AND "CONFIRMED" CLAIMED AN ACT NOBODY CAN PERFORM. It reads
                    `confirmedAt`, whose own command (`confirmGoal`) is not on
                    the production surface; the only thing that writes it is a
                    promotion, as a side effect. So in production it meant "last
                    promoted to Primary" under a label that promised a
                    confirmation. It is not shown rather than shown wrongly —
                    the field and its command are both left exactly as they are,
                    for the batch that gives confirming a surface. */}
                <Fact label="Wanted since" value={day(goal.createdAt) || day(goal.since)} />
              </>
            }
          >
            {found.length ? (
              <ul className="mcs-sub">
                {found.map((d) => (
                  <li key={d.key}>
                    <Tag tone="strong">Available now</Tag>
                    <span className="mcs-sub-t">
                      {holdingLine(partnerName.get(d.partnerId), d.copies)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
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
            {onSetPriority || onRemoveGoal ? (
              <p className="mcs-goal-do">
                {onSetPriority ? (
                  <button className="mcs-go" type="button" disabled={busy === goal.id}
                    onClick={() => flip(goal)}>
                    {goal.tier === "primary"
                      ? "Just keep an eye out instead"
                      : "I'm actively hunting this"}
                  </button>
                ) : null}
                {onRemoveGoal ? (
                  <button className="mcs-go quiet" type="button" disabled={busy === goal.id}
                    onClick={() => drop(goal)}>
                    No longer looking
                  </button>
                ) : null}
              </p>
            ) : null}
            {onRemoveGoal && bindersLost(goal)
              ? <p className="mcs-dim" role="status">{bindersLost(goal)}</p> : null}
          </Record>
        );
      })}
    </Panel>
    </>
  );
}

