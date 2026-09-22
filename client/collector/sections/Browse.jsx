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
   same panel and both end in the same commands. The `+` is there because most
   of the time a person already knows, and making them open a card to say so is
   a step for the product's benefit rather than theirs. They differ in nothing
   that persists — C3.3 kept them one call rather than two paths, because two
   paths to one durable outcome is two things to keep agreeing with each other.

   NOTHING IS WRITTEN UNTIL THE LAST BUTTON. Opening a card writes nothing.
   Choosing a version writes nothing. Ticking a binder, choosing how hard you
   are looking, typing a grade, adding a copy, changing your mind and pressing
   Cancel all write nothing — there is no draft, no bookmark, no queue, and no
   record anywhere of a card somebody looked at. The only thing that writes is
   Save, and until it is pressed this screen has asked the server for nothing
   but catalogue reads.

   WHICH IS ALSO WHY BROWSING CANNOT PRODUCE A DISCOVERY. A discovery is an
   overlap between a Goal and a partner's copy; with no Goal there is no
   overlap, and this screen cannot make one by being looked at.

   THE PANEL SITS OVER THE GRID AND THE GRID STAYS WHERE IT WAS. That is the
   whole of "come back to where you were": nothing unmounts, so the scroll
   position, the page, the doorway and the results are simply still there. The
   session lives above this section too, so a trip to Goals and back lands in
   the same place.

   OVER, NOT ABOVE — WHICH IS THE FIX C3.3 MADE. Until C3.3 the panel was
   rendered BEFORE the grid in ordinary flow, so opening it inserted its whole
   height above everything the person was looking at while the window's scroll
   position stayed put: the cards jumped down on open and back up on close.
   With C1's small panel that was a few lines of movement and nobody filed it.
   C3.3's panel carries binders, a want, a grade, and a list of copies, so it
   would have shoved the grid most of a screen. It is out of flow now — a sheet
   on a phone, a side panel on a wide screen — and the grid underneath does not
   move at all. Nothing is captured and nothing is restored, because nothing is
   ever lost: there is no scroll-restoration code here, and there should not be.

   WHAT A COLLECTOR IS TOLD ABOUT THEIR NETWORK comes from their own projection
   and nowhere else: the copies their Trusted Partners have, which the server
   already decided they may see. It is counted here, never stored, and it names
   nobody — how many partners, not which.
   ========================================================================== */

import React, { useState } from "react";
import CardBrowser from "../../browse/CardBrowser.jsx";
import { Panel } from "../parts.jsx";
import CardSpecification from "../CardSpecification.jsx";
import { rows, text } from "../present.js";

const AVAILABLE = "available";

export default function Browse({ state, session, onSession, onSpecify = null,
  onBrowseCards = null }) {
  const [context, setContext] = useState(null);      // the card context being specified
  const [chosen, setChosen] = useState(null);        // the exact canonical card
  const [problem, setProblem] = useState(null);
  const [opening, setOpening] = useState(false);

  /* WHAT THE COLLECTOR ALREADY WANTS, so a card they have already asked for
     says so instead of offering to ask again. Their own goals, from their own
     projection. */
  const wanted = new Set(rows(state && state.goals).map((g) => g.canonicalCardId).filter(Boolean));
  /* And what they already own or have filed, for the same reason: the grid
     should say which cards the person has already said something about. */
  const owned = new Set(rows(state && state.collectorCopies)
    .map((b) => b.canonicalCardId).filter(Boolean));

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

  const versions = rows(context && context.cards);
  const holders = chosen ? holdersOf(chosen.canonicalCardId) : 0;

  return (
    <Panel title="Browse" note={null}>
      {/* THE GRID IS FIRST AND IS NEVER UNMOUNTED. The specification sheet is
          its sibling and is rendered AFTER it, out of flow, so opening one
          moves nothing behind it. That ordering is the whole of Browse
          preservation: there is no state to save and none to restore. */}
      <CardBrowser browse={onBrowseCards} prefix="mcs" session={session} onSession={onSession}
        onChoose={open} chosenId={context && context.cardContextId} busy={opening} />

      {context ? (
        <div className="mcs-spec-scrim">
          {/* WHICH PRINTING, BEFORE ANYTHING ELSE. A card context can hold
              several canonical cards and every fact this panel writes names
              exactly one of them, so the question is asked first and nothing
              else is offered until it is answered. One printing is not a
              choice, so there is nothing to ask. */}
          {!chosen ? (
            <div className="mcs-spec-panel">
              <div className="mcs-spec-head">
                <div>
                  <strong>{text(context.cardName)}</strong>
                  <p className="mcs-spec-sub">
                    {[text(context.expansionName),
                      context.collectorNumber ? `#${context.collectorNumber}` : null,
                      text(context.artist)].filter(Boolean).join(" \u00b7 ")}
                  </p>
                </div>
                <button className="mcs-go quiet" type="button" onClick={close}>Cancel</button>
              </div>
              {problem ? <p className="mcs-add-problem" role="alert">{problem}</p> : null}
              {versions.length ? (
                <>
                  <p className="mcs-spec-ask">Which one?</p>
                  <ul className="mcs-add-versions">
                    {versions.map((card) => (
                      <li key={card.canonicalCardId}>
                        <button type="button" className="mcs-add-row"
                          onClick={() => setChosen(card)}>
                          {[card.printRun, card.finish, card.language].filter(Boolean).join(" \u00b7 ")
                            || "Standard"}
                          {wanted.has(card.canonicalCardId) || owned.has(card.canonicalCardId) ? (
                            <span className="mcs-dim">
                              {wanted.has(card.canonicalCardId) && owned.has(card.canonicalCardId)
                                ? "on your list, and you own one"
                                : wanted.has(card.canonicalCardId) ? "on your list" : "you own one"}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : (
            <CardSpecification
              card={chosen}
              context={context}
              state={state}
              holders={holders}
              onCommit={onSpecify}
              onClose={close}
            />
          )}
        </div>
      ) : null}
    </Panel>
  );
}
