/* ============================================================================
   ONE CARD, LARGE — THE COLLECTOR'S CARD VIEWER (Milestone 2C.2; shared from
   Milestone 2D.2's refinement)

   The dialog View Matches opens on a copy, and the Deal Workspace opens from
   its header picture, so the exact card stays in reach for the whole deal.
   One viewer, two doors: both say the same thing about the same pictures.

   TWO KINDS OF PICTURE, NEVER CONFUSED:
     catalog image   what the PRINTING looks like — the catalogue's own front
                     image (C7.1's allow-list), drawn through CardArt
     actual photos   what THIS physical copy looks like — the Trusted
                     Partner's. The domain holds them as references the
                     partner typed, not images MetYet holds, so they are said
                     in words (`photoNote`) and never drawn.
   The catalogue has no back image, and nothing stands in for one: the viewer
   says there is no back image rather than drawing a front twice.

   Nothing is fetched or invented here. It sends nothing — except Request
   actual photos, when its caller offers it and the Collector presses it.
   ========================================================================== */
import React, { useEffect, useRef } from "react";
import CardArt from "../card-art.jsx";
import { text, gradeLine, photoNote, versionLabel } from "./present.js";

/* What there is to look at for one physical copy, and where it came from. */
export function picturesOf(copy, card) {
  return { catalog: !!(card && (text(card.imageSmall) || text(card.imageLarge))), sides: photoNote(copy && copy.photos) };
}

/* A dialog with its own Close, Escape and a tap outside; focus starts on
   Close, and the caller returns it to whatever opened the viewer. `id` names
   the dialog's title; `copy` may be absent (a deal whose copy has left the
   shelf), and then only the printing is described. */
export function PhotoViewer({ id, pics, card, copy = null, partner, asked = false, canAsk = false, busy = false,
  onRequest = null, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => { if (closeRef.current && closeRef.current.focus) closeRef.current.focus(); }, []);
  const name = (card && card.cardName) || "This card";
  const titleId = `mcs-pv-${id}`;
  return (
    <div className="mcs-pv-scrim" role="dialog" aria-modal="true" aria-labelledby={titleId}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="mcs-pv">
        <div className="mcs-pv-hd">
          <p className="mcs-pv-title" id={titleId}>
            <strong>{name}</strong>
            <span>{[card && text(card.finish) ? versionLabel(card) : null, copy ? gradeLine(copy) : null, partner].filter(Boolean).join(" · ")}</span>
          </p>
          <button type="button" className="mcs-go quiet" ref={closeRef} onClick={onClose}>Close</button>
        </div>
        <div className="mcs-pv-stage" role="img" aria-label={pics.catalog ? `Catalog image of ${name}` : `No picture of ${name} yet`}>
          <CardArt src={card && (card.imageLarge || card.imageSmall)} name={card && card.cardName}
            wrap="mcs-pv-big" plate="mcs-art-plate" decorative />
        </div>
        <p className="mcs-pv-says">
          {pics.catalog ? "Catalog image — it shows the printing, not this copy's condition." : "There's no picture of this card yet."}
        </p>
        <p className="mcs-pv-says mcs-pv-back">No back image.</p>
        {pics.sides ? (
          <p className="mcs-pv-says">{`${partner} has added photos of this copy (${pics.sides.toLowerCase()}), but MetYet can't show them yet.`}</p>
        ) : asked ? <p className="mcs-pv-says">Photos requested</p> : null}
        {canAsk && onRequest ? (
          <button type="button" className="mcs-go mcs-go-primary mcs-pv-ask" disabled={busy} onClick={onRequest}>
            Request actual photos
          </button>
        ) : null}
      </div>
    </div>
  );
}
