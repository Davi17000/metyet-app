/* ============================================================================
   BROWSE — FINDING THE CARD YOU MEAN (Phase 5 C1)

   Until now a Collector could only say what they were looking for by typing its
   name into a box on the Goals screen and hoping they had spelled it the way
   the catalogue does. That is not how anybody looks for a card. They look by
   the Pokémon, by the set, or by who drew it, and they look at pictures.

   So Browse is a place, not a field: it is the first thing in the navigation,
   it is where a Collector spends time, and saying "I'm looking for this" is
   something that happens WHILE browsing rather than somewhere else afterwards.

   TWO WAYS IN, ONE ENDING. Pressing the card and pressing its `+` both open the
   same panel and both end in the same command. The `+` is there because most of
   the time a person already knows, and making them open a card to say so is a
   step for the product's benefit rather than theirs.

   NOTHING IS WRITTEN UNTIL THE LAST BUTTON. Opening a card writes nothing.
   Choosing a version writes nothing. Changing your mind writes nothing, and
   Cancel writes nothing — there is no draft, no bookmark, no queue, and no
   record anywhere of a card somebody looked at. The only thing that creates a
   Goal is the Goal button, and until it is pressed this screen has asked the
   server for nothing but catalogue reads.

   WHICH IS ALSO WHY BROWSING CANNOT PRODUCE A DISCOVERY. A discovery is an
   overlap between a Goal and a partner's copy; with no Goal there is no
   overlap, and this screen cannot make one by being looked at.

   THE PANEL SITS ABOVE THE GRID AND THE GRID STAYS WHERE IT WAS. That is the
   whole of "come back to where you were": nothing unmounts, so the scroll
   position, the page, the doorway and the results are simply still there. The
   session lives above this section too, so a trip to Goals and back lands in
   the same place.

   WHAT A COLLECTOR IS TOLD ABOUT THEIR NETWORK comes from their own projection
   and nowhere else: the copies their Trusted Partners have, which the server
   already decided they may see. It is counted here, never stored, and it names
   nobody — how many partners, not which.
   ========================================================================== */

import React, { useEffect, useState } from "react";
import CardBrowser from "../../browse/CardBrowser.jsx";
import { Panel } from "../parts.jsx";
import { rows, text } from "../present.js";

const AVAILABLE = "available";

export default function Browse({ state, session, onSession, onAddGoal = null, onBrowseCards = null }) {
  const [context, setContext] = useState(null);      // the card context being specified
  const [chosen, setChosen] = useState(null);        // the exact canonical card
  const [problem, setProblem] = useState(null);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);

  /* WHAT THE COLLECTOR ALREADY WANTS, so a card they have already asked for
     says so instead of offering to ask again. Their own goals, from their own
     projection. */
  const wanted = new Set(rows(state && state.goals).map((g) => g.canonicalCardId).filter(Boolean));

  /* WHO IN THEIR NETWORK HAS IT. `inventory` in a Collector's projection is
     their Trusted Partners' current supply — the server scoped it — so this is
     a count of rows they were already sent, by partner, never by copy. */
  const holdersOf = (canonicalCardId) => {
    const who = new Set();
    for (const copy of rows(state && state.inventory)) {
      if (copy.canonicalCardId === canonicalCardId && copy.archived !== true
        && copy.status === AVAILABLE && copy.partnerId) who.add(copy.partnerId);
    }
    return who.size;
  };

  const close = () => { setContext(null); setChosen(null); setProblem(null); };

  const open = async (row) => {
    if (!onBrowseCards || opening) return;
    setOpening(true); setProblem(null); setChosen(null);
    try {
      const answer = await onBrowseCards.read(row.cardContextId);
      const cards = rows(answer && answer.canonicalCards);
      setContext({ ...row, cards });
      setChosen(cards.length === 1 ? cards[0] : null);
      if (!cards.length) setProblem("MetYet has no version of this card to look for yet.");
    } catch (error) {
      setContext(null);
      setProblem("That card could not be read. Try again in a moment.");
    } finally { setOpening(false); }
  };

  const save = async (tier) => {
    if (!chosen || saving || !onAddGoal) return;
    setSaving(true); setProblem(null);
    try {
      const answer = await onAddGoal({ canonicalCardId: chosen.canonicalCardId, tier });
      if (answer && answer.ok === false) {
        setProblem(answer.refused === "duplicate-goal"
          ? "That exact card is already on your list."
          : answer.refused === "card-unavailable"
            ? "That version is no longer one MetYet can look for. Choose another."
            : "MetYet would not accept that. Try again.");
        setSaving(false);
        return;
      }
      close();
    } catch (error) {
      setProblem("MetYet lost contact, so it cannot tell whether that was added. "
        + "Check your goals before trying again.");
      setSaving(false);
    }
  };

  const versions = rows(context && context.cards);
  const already = chosen && wanted.has(chosen.canonicalCardId);
  const holders = chosen ? holdersOf(chosen.canonicalCardId) : 0;

  return (
    <Panel title="Browse" note={null}>
      {context ? (
        <div className="mcs-spec">
          <div className="mcs-add-head">
            <strong>{text(context.cardName)}</strong>
            <button className="mcs-go quiet" type="button" onClick={close} disabled={saving}>
              Cancel
            </button>
          </div>
          <p className="mcs-spec-sub">
            {[text(context.expansionName), context.collectorNumber ? `#${context.collectorNumber}` : null,
              text(context.artist)].filter(Boolean).join(" · ")}
          </p>

          {versions.length > 1 ? (
            <>
              <p className="mcs-spec-ask">Which one are you looking for?</p>
              <ul className="mcs-add-versions">
                {versions.map((card) => (
                  <li key={card.canonicalCardId}>
                    <button type="button" disabled={saving}
                      className={`mcs-add-row${chosen && chosen.canonicalCardId === card.canonicalCardId ? " on" : ""}`}
                      onClick={() => setChosen(card)}>
                      {[card.printRun, card.finish, card.language].filter(Boolean).join(" · ")
                        || "Standard"}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {chosen ? (
            <p className="mcs-spec-net">
              {holders === 0 ? "None of your Trusted Partners has this listed right now."
                : holders === 1 ? "1 of your Trusted Partners has this."
                  : `${holders} of your Trusted Partners have this.`}
            </p>
          ) : null}

          {problem ? <p className="mcs-add-problem" role="alert">{problem}</p> : null}

          {already ? (
            <p className="mcs-spec-ask">This exact card is already on your list.</p>
          ) : (
            <p className="mcs-goal-do">
              <button className="mcs-go" type="button" disabled={!chosen || saving}
                onClick={() => save("primary")}>
                I&rsquo;m actively hunting this
              </button>
              <button className="mcs-go quiet" type="button" disabled={!chosen || saving}
                onClick={() => save("secondary")}>
                Keep an eye out for it
              </button>
            </p>
          )}
        </div>
      ) : null}

      <CardBrowser browse={onBrowseCards} prefix="mcs" session={session} onSession={onSession}
        onChoose={open} chosenId={context && context.cardContextId} busy={opening || saving} />
    </Panel>
  );
}
