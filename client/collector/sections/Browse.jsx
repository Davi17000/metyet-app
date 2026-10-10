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

   AND BROWSE TELLS A COLLECTOR NOTHING ABOUT THEIR NETWORK (Phase 5 C5). It
   used to count how many of their Trusted Partners held the chosen card and
   hand that number to the specification panel, anonymously — which was a weaker
   answer than the named one the Trusted Partners section already gives, and was
   shown only to people who arrived here rather than from a binder. Both the
   count and the line it fed are gone. What is left is the catalogue and the
   Collector's own marks on it: cards they have already asked for, and cards
   they already own.
   ========================================================================== */

import React, { useRef, useState } from "react";
import CardSpecification from "../CardSpecification.jsx";
import CardDetail from "../CardDetail.jsx";
import Discover, { newBrowseSession } from "../../browse/Discover.jsx";
import { rows, text } from "../present.js";

/* The session the shell keeps (P6-F2): Browse's own, defined beside it. */
export { newBrowseSession };

export default function Browse({ state, session, onSession, onSpecify = null,
  onBrowseCards = null, fillingBinder = null, onDoneFilling = null, onCount = null }) {
  /* P6-F3A Stage 1: a card opens as the Phase 6 full-screen CardDetail. Its
     neighbours are the Browse results it was opened from, so ‹ › walk them.
     "Add to MetYet" opens the existing Card Specification for the chosen
     version — today's save path, until Stage 2 ports the guided questions. */
  const [context, setContext] = useState(null);      // the card being shown: row + its printings
  const [nav, setNav] = useState(null);              // { list, index, label } — where it was opened from
  const [specifying, setSpecifying] = useState(null); // the exact canonical card, in the current form
  const [problem, setProblem] = useState(null);
  const [opening, setOpening] = useState(false);
  const reading = useRef(0);

  const close = () => { setContext(null); setNav(null); setSpecifying(null); setProblem(null); };

  const show = async (row, list, label) => {
    if (!onBrowseCards || opening) return;
    const ticket = ++reading.current;
    setOpening(true); setProblem(null); setSpecifying(null);
    try {
      const answer = await onBrowseCards.read(row.cardContextId);
      if (ticket !== reading.current) return;
      const at = list.findIndex((r) => r.cardContextId === row.cardContextId);
      setNav({ list, index: at < 0 ? 0 : at, label });
      setContext({ ...row, ...((answer && answer.context) || {}), imageSmall: row.imageSmall, imageLarge: row.imageLarge,
        cards: rows(answer && answer.canonicalCards) });
    } catch (error) {
      if (ticket !== reading.current) return;
      setProblem("That card could not be read. Try again in a moment.");
    } finally { if (ticket === reading.current) setOpening(false); }
  };
  const open = (row, list = [row], label = "Browse") => show(row, list, label);
  const step = (d) => {
    if (!nav) return;
    const next = nav.list[nav.index + d];
    if (next) show(next, nav.list, nav.label);
  };

  return (
    <div className="mcs-browse">
      {/* WHICH BINDER IS BEING FILLED, QUIETLY (Phase 5 C3.4). Somebody arrived
          here from a binder and is adding cards to it; the panel will tick that
          binder for them, and they can untick it. It is a note about where they
          came from, not a mode: browsing is unchanged, nothing is written by
          carrying it, and dismissing it is the end of it. */}
      {fillingBinder ? (
        <p className="mcs-filling" role="status">
          <span>Adding to <strong>{text(fillingBinder.name) || "a binder"}</strong></span>
          {onDoneFilling ? (
            <button className="mcs-linkish" type="button" onClick={onDoneFilling}>
              Stop adding to it
            </button>
          ) : null}
        </p>
      ) : null}
      {/* THE GRID IS FIRST AND IS NEVER UNMOUNTED. The card and the form are
          its siblings, rendered AFTER it and out of flow, so opening one moves
          nothing behind it: the results, their order and the page's scroll
          are simply still there when the card closes. */}
      <Discover state={state} browse={onBrowseCards} browsing={session || newBrowseSession()} onBrowsing={onSession}
        onChoose={open} chosenId={context && context.cardContextId} busy={opening} onCount={onCount} />
      {problem ? <p className="mcs-add-problem" role="alert">{problem}</p> : null}

      {context ? (
        <CardDetail key={context.cardContextId} context={context} state={state}
          backLabel={(nav && nav.label) || "Browse"} position={nav ? nav.index : 0} total={nav ? nav.list.length : 1}
          onStep={nav && nav.list.length > 1 ? step : null} onClose={close}
          onAdd={onSpecify ? (card) => setSpecifying(card) : null} />
      ) : null}
      {context && specifying ? (
        <div className="mcs-spec-scrim">
          <CardSpecification
            card={specifying}
            context={context}
            state={state}
            preselectBinder={fillingBinder ? fillingBinder.binderId : null}
            onCommit={onSpecify}
            onClose={() => setSpecifying(null)}
          />
        </div>
      ) : null}
    </div>
  );
}
