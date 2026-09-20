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

import React, { useEffect, useMemo, useState } from "react";
import { Panel, Record, Fact, Tag } from "../parts.jsx";
import { rows, indexById, groupBy, text, day, money, plural, cardTitle, cardSetLine,
  gradeLine, cardMarks, stageLabel, isKnownStage, tierLabel, tierIntent, byRecency } from "../present.js";

export default function Goals({ state, onAddGoal = null, onSetPriority = null,
  onRemoveGoal = null, onBrowseCards = null }) {
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

  const [adding, setAdding] = useState(false);
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
    {onAddGoal && onBrowseCards ? (
      adding
        ? <AddGoal browse={onBrowseCards} onAdd={onAddGoal} onDone={() => setAdding(false)} />
        : <p className="mcs-addbar">
            <button className="mcs-go" type="button" onClick={() => setAdding(true)}>
              Add a card you're looking for
            </button>
          </p>
    ) : null}
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
          </Record>
        );
      })}
    </Panel>
    </>
  );
}

/* ============================================================================
   ADDING A CARD YOU ARE LOOKING FOR

   FIND, CHOOSE, SAY HOW HARD YOU ARE LOOKING. The middle step disappears when
   the card has only one collectible printing, because a chooser with one option
   is a question nobody asked. It never disappears when there are several: the
   1st Edition and the Unlimited are different cards to want, and flattening
   them would make somebody's stated demand mean something they did not say.

   NOTHING HERE INFERS ANYTHING. Searching creates no goal; opening a card
   creates no goal. The only thing that creates one is a person pressing one of
   the two buttons at the end, and those two are the whole vocabulary — there is
   no third level, no score, and no "maybe". */
function AddGoal({ browse, onAdd, onDone }) {
  const [query, setQuery] = useState("");
  const [looking, setLooking] = useState(false);
  const [results, setResults] = useState(null);
  const [context, setContext] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [problem, setProblem] = useState(null);
  const [saving, setSaving] = useState(false);

  const find = async (event) => {
    if (event && event.preventDefault) event.preventDefault();
    const term = String(query).trim();
    if (!term) return;
    setProblem(null); setLooking(true); setResults(null);
    try {
      const answer = await browse.find(`query=${encodeURIComponent(term)}&pageSize=20`);
      setResults(rows(answer && answer.contexts));
    } catch (error) {
      setProblem("MetYet's card list could not be reached. Try again in a moment.");
    } finally { setLooking(false); }
  };

  const open = async (row) => {
    setProblem(null); setLooking(true);
    try {
      const answer = await browse.read(row.cardContextId);
      const cards = rows(answer && answer.canonicalCards);
      setContext({ ...row, cards });
      setChosen(cards.length === 1 ? cards[0] : null);
      if (!cards.length) setProblem("MetYet has no version of this card to look for yet.");
    } catch (error) {
      setProblem("That card could not be read. Try again in a moment.");
    } finally { setLooking(false); }
  };

  const save = async (tier) => {
    if (!chosen || saving) return;
    setSaving(true); setProblem(null);
    try {
      const answer = await onAdd({ canonicalCardId: chosen.canonicalCardId, tier });
      if (answer && answer.ok === false) {
        setProblem(answer.refused === "duplicate-goal"
          ? "That exact card is already on your list."
          : answer.refused === "card-unavailable"
            ? "That version is no longer one MetYet can look for. Choose another."
            : "MetYet would not accept that. Try again.");
        setSaving(false);
        return;
      }
      onDone();
    } catch (error) {
      setProblem("MetYet lost contact, so it cannot tell whether that was added. Re-open your goals before trying again.");
      setSaving(false);
    }
  };

  return (
    <div className="mcs-add">
      <div className="mcs-add-head">
        <strong>Add a card you're looking for</strong>
        <button className="mcs-go quiet" type="button" onClick={onDone}>Cancel</button>
      </div>

      {!context ? (
        <>
          <form onSubmit={find}>
            <label className="mcs-field">
              <span>Which card?</span>
              <input value={query} autoFocus type="search" placeholder="Charizard"
                onChange={(e) => setQuery(e.target.value)} />
            </label>
            <button className="mcs-go" type="submit" disabled={looking}>
              {looking ? "Looking…" : "Search"}
            </button>
          </form>
          {results && !results.length ? (
            <p className="mcs-empty">
              No card by that name. MetYet&apos;s card list is still being filled, so one that
              exists may not be here yet.
            </p>
          ) : null}
          {rows(results).map((row) => (
            <button key={row.cardContextId} className="mcs-add-row" type="button"
              onClick={() => open(row)}>
              <span>{row.cardName}</span>
              <span className="mcs-dim">
                {[row.expansionName, row.collectorNumber ? `#${row.collectorNumber}` : null]
                  .filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
        </>
      ) : (
        <>
          <p className="mcs-add-card">
            <strong>{context.cardName}</strong>
            <span className="mcs-dim">
              {[context.expansionName, context.collectorNumber ? `#${context.collectorNumber}` : null]
                .filter(Boolean).join(" · ")}
            </span>
            <button className="mcs-go quiet" type="button"
              onClick={() => { setContext(null); setChosen(null); setProblem(null); }}>
              Choose a different card
            </button>
          </p>

          {context.cards.length > 1 ? (
            <div className="mcs-add-versions">
              <span>Which version are you after?</span>
              {context.cards.map((card) => (
                <button key={card.canonicalCardId} type="button"
                  className={"mcs-add-row" + (chosen && chosen.canonicalCardId === card.canonicalCardId ? " on" : "")}
                  onClick={() => setChosen(card)}>
                  {[card.finish, card.printRun, card.language].filter(Boolean).join(" · ")}
                </button>
              ))}
            </div>
          ) : null}

          {chosen ? (
            <div className="mcs-add-intent">
              <span>How hard are you looking?</span>
              <button className="mcs-go" type="button" disabled={saving}
                onClick={() => save("primary")}>
                I&apos;m actively hunting this
              </button>
              <button className="mcs-go quiet" type="button" disabled={saving}
                onClick={() => save("secondary")}>
                Just keep an eye out
              </button>
            </div>
          ) : null}
        </>
      )}

      {problem ? <p className="mcs-add-problem" role="alert">{problem}</p> : null}
    </div>
  );
}
