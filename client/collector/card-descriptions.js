/* ============================================================================
   WHAT A CANONICAL CARD IS CALLED — ASKED ONCE, SHARED BY EVERYTHING ON SCREEN

   The projection carries canonical card IDS, not card names: identity is the
   catalogue's and the product refuses to copy it into product rows (Phase 5
   B5). So every screen that lists cards has to ask what they are CALLED, and
   has done since Batch 7, in one request for the ids it holds rather than one
   per row.

   WHY THIS IS A MODULE AND NOT A `useState` IN EACH SECTION. Binders now shows
   five different views of the same small set of cards, and the person moves
   between them by pressing a chip. Each section keeping its own cache meant the
   answer was thrown away and bought again on every press: nine presses over
   three cards cost nine round-trips, because `Collection` unmounts when the
   binder library comes back and `Binder` kept a second cache of its own. The
   names of cards do not change while somebody is deciding which tab to look at.

   ASK ONCE PER ID, NOT ONCE PER VIEW. `asked` remembers every id that has been
   sent, so a view asks only for what nobody has asked for yet and a view whose
   cards are all known asks for nothing at all. A FAILED request forgets its ids
   again: a request that did not arrive is not an answer, and a screen that
   never retries would stay nameless for the rest of the session.

   IT IS A CACHE OF CAPTIONS AND NOTHING ELSE. Nothing here is durable, nothing
   is written, and a card whose description has not arrived still renders — it
   still means something to somebody whether or not this module knows its name.
   ========================================================================== */

import { useCallback, useRef, useState } from "react";
import { rows } from "./present.js";

export const useCardDescriptions = (onBrowseCards) => {
  const [described, setDescribed] = useState({});
  const asked = useRef(null);
  if (asked.current === null) asked.current = new Set();

  const describe = useCallback(async (ids) => {
    if (!onBrowseCards) return;
    const want = rows(ids)
      .map((id) => (id == null ? "" : String(id)))
      .filter((id) => id && !asked.current.has(id));
    if (!want.length) return;
    for (const id of want) asked.current.add(id);
    try {
      const answer = await onBrowseCards.describe(want);
      const next = {};
      for (const card of rows(answer && answer.cards)) {
        if (card && card.canonicalCardId != null) next[String(card.canonicalCardId)] = card;
      }
      setDescribed((held) => ({ ...held, ...next }));
    } catch (error) {
      /* Not an answer — let a later render ask again. */
      for (const id of want) asked.current.delete(id);
    }
  }, [onBrowseCards]);

  return { described, describe };
};
