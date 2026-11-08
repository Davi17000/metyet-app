/* ============================================================================
   SELECT TRADE — WHAT BOTH SEATS SHARE (M3A A3)

   The partner chooses which of the Collector's Trade/Sell copies to consider
   for one deal; the Collector says "hold on" or "ready", and may take a card
   back out. Both screens read the same three things the server sent, and say
   them the same way, so they live here once:

     the deal's ROWS     `trade.cards` — one per copy the partner chose, with
                         `inclusion` and `withdrawn` exactly as stored
     the deal's TURN     `turn` — who moves and why, from the domain's one
                         turn engine (projection's `withTurn`)
     each copy's STATUS  `collectorCopies[].status` — for a partner, derived
                         only from their own deals (collectorCopyForViewer)

   NOTHING HERE DECIDES ANYTHING. A row is "in this deal" when the record says
   it was chosen and not taken out — the domain's own `liveRow`, read off the
   stored fields rather than worked out. Whose move it is, is `turn`. Whether a
   copy may be chosen is its projected status. Whether a choice or a close is
   allowed is the server's answer, and only the server's answer.
   ========================================================================== */
import React from "react";
import CardArt from "./card-art.jsx";
import { printingLine } from "./printing.js";

const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const list = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);

/* ---------------------------------------------------------------- ROWS */
/* The deal's rows as stored. In the deal: chosen and not taken out (the
   domain's `liveRow`, M3A A1). Out of it, kept as history: taken out by the
   Collector (`withdrawn`) or removed by the partner (`inclusion: rejected`). */
export const tradeRows = (deal) => list(deal && deal.trade && deal.trade.cards);
export const inDeal = (row) => !!row && row.inclusion === "accepted" && !row.withdrawn;
export const liveRows = (deal) => tradeRows(deal).filter(inDeal);
export const takenOut = (deal) => tradeRows(deal).filter((r) => r.withdrawn === true);

export const turnOf = (deal) => (deal && deal.turn && typeof deal.turn === "object" ? deal.turn : {});
/* WHERE THE DEAL IS, FROM ITS TURN — never from comparing stages. The turn
   engine's own reasons (domain `nextActor`) say whether cards are being
   chosen or valued; a reason this build has never seen is neither, so nothing
   here is drawn for it. */
const CHOOSING = new Set(["select-trade", "more-cards", "adding-cards", "close-selection", "trade-reviewed"]);
const VALUING = new Set(["value", "values-settled"]);
export const isSelectingStage = (deal) => turnOf(deal).active === true && CHOOSING.has(turnOf(deal).reason);
export const isValuingStage = (deal) => turnOf(deal).active === true && VALUING.has(turnOf(deal).reason);
/* Whose move, and why — the server's `turn`, nothing else. */
export const myMove = (deal, seat, ...reasons) => {
  const t = turnOf(deal);
  return !!seat && t.seat === seat && reasons.includes(t.reason);
};

/* ------------------------------------------------- WHAT MAY BE CHOSEN
   A copy the partner may still choose for THIS deal: its status for them is
   `available`, or `selected` — choosing is not holding (M3A A1), so a copy one
   of their OTHER deals is considering may be chosen here too — and it is not
   already in this deal. Every other status (`reserved`, `committed`, `traded`,
   `unavailable`) is a hold or a history the server has already said no to. */
const CHOOSABLE = new Set(["available", "selected"]);
export const choosableCopies = (deal, copies) => {
  const here = new Set(liveRows(deal).map((r) => r.binderId));
  return list(copies).filter((b) => b.collectorId === deal.collectorId
    && CHOOSABLE.has(text(b.status)) && !here.has(b.id));
};
/* A row of this deal whose copy the server no longer shows as merely chosen:
   held by another deal, traded, or gone from view. A hint drawn from the
   projection, so the person can see it before they press anything; the
   server's refusal (`detail.tradeCardIds`) is what decides. */
export const looksUnavailable = (row, copy) => !copy || text(copy.status) !== "selected";

/* --------------------------------------------------------- A COPY, SAID
   The printing from the catalogue's description of the copy's own canonical
   card; the object — grade or raw condition, certificate, photographs — from
   the copy's own record, or the row's snapshot when the copy is not in view.
   A grading pair that disagrees with itself shows both halves. Nothing is
   filled in. */
const gradingOf = (copy, row) => {
  const reading = copy && copy.grading;
  if (reading && text(reading.label)) {
    const said = [text(reading.label), text(reading.condition)].filter(Boolean);
    return { label: reading.label, graded: reading.state === "graded",
      conflict: reading.problem && said.length === 2 ? `${said[0]} and ${said[1]}` : null };
  }
  const src = copy || row || {};
  const grade = text(src.grade);
  const condition = text(src.condition);
  if (grade && /^raw$/i.test(grade)) return { label: condition ? `Raw · ${condition}` : "Raw", graded: false, conflict: null };
  return { label: grade || condition || null, graded: !!grade, conflict: null };
};
const photosOf = (photos) => {
  if (!photos || typeof photos !== "object") return null;
  const has = ["front", "back"].filter((side) => text(photos[side]));
  if (!has.length) return null;
  return has.length === 2 ? "front and back" : has[0] === "front" ? "front only" : "back only";
};
export const copyName = (card, copy) => (card && text(card.cardName))
  || ((copy && copy.canonicalCardId) ? "A card MetYet is still describing" : "A card MetYet can't describe");

/* One physical copy as a row: picture, name, printing, grade, certificate and
   photographs, then whatever the caller puts beside it (a tag, a button). The
   row is keyed and marked by the COPY's id, so two copies of one printing are
   always two rows. */
/* `body` (M3B B3), optional: more about the row under it — Value Trade puts a
   card's figures, history and answers there. Without it the row is unchanged. */
export function CopyRow({ cls, copy = null, row = null, card = null, tag = null, warn = false, children = null, id = null, body = null }) {
  const src = copy || row || {};
  const g = gradingOf(copy, row);
  const cert = g.graded ? text(src.cert) : null;
  const photos = photosOf(src.photos);
  const printing = printingLine(card);
  return (
    <li className={`${cls}-sel-copy`} data-copy={(copy && copy.id) || (row && row.binderId) || undefined}
      data-row={(row && row.id) || undefined} id={id || undefined}>
      <CardArt src={card && card.imageSmall} name={card && card.cardName} wrap={`${cls}-sel-art`} plate={`${cls}-sel-plate`} decorative />
      <span className={`${cls}-sel-id`}>
        <span className={`${cls}-sel-t`}>{copyName(card, src)}</span>
        {printing ? <span className={`${cls}-sel-s`}>{printing}</span> : null}
        <span className={`${cls}-sel-f`}>
          {[g.label, cert ? `Cert ${cert}` : null, photos ? `Photos: ${photos}` : null].filter(Boolean).join(" · ") || null}
        </span>
        {g.conflict ? <span className={`${cls}-sel-warn`}>{`Says ${g.conflict}`}</span> : null}
        {tag ? <span className={`${cls}-sel-tag${warn ? " warn" : ""}`}>{tag}</span> : null}
      </span>
      {children ? <span className={`${cls}-sel-do`}>{children}</span> : null}
      {body ? <div className={`${cls}-vt-body`}>{body}</div> : null}
    </li>
  );
}

/* -------------------------------------------------------- WHAT WENT WRONG
   Select Trade's refusals in a sentence a person can act on. Every one of them
   means the deal is not what the screen showed, so the screen re-reads after
   any of them (useSender's `refreshAlways`). A code not listed here falls
   through to the shared table in negotiation.jsx. */
export const selectRefusal = (seat, other) => (code) => {
  const them = other || (seat === "tp" ? "the collector" : "your Trusted Partner");
  const TABLE = {
    "copy-unavailable": seat === "tp"
      ? "A card you chose isn't available for this deal any more. It's marked below — remove it to continue."
      : "That card isn't available for this deal any more. The latest is shown.",
    "copy-in-use": "That card is already in this deal. The latest is shown.",
    "terms-changed": "This deal changed since you looked. The latest is shown — check the cards and try again.",
    "not-your-turn": `It's ${them}'s move on this deal right now. The latest is shown.`,
    "wrong-stage": "This deal has moved on. The latest is shown.",
    "nothing-to-accept": seat === "tp"
      ? "Choose at least one card first."
      : "That card is already out of this deal. The latest is shown.",
    "no-relationship": seat === "tp"
      ? `You're no longer connected with ${them}, so cards can't be chosen for this deal.`
      : `You're no longer connected with ${them}.`,
    "copy-committed": "Both of you have agreed this deal, so cards can't be taken out of it.",
    terminal: "This deal has ended.",
  };
  return TABLE[code] || null;
};
/* What a lost answer means here: the command may or may not have landed, so
   nothing is claimed, and the screen shows what the server says now. */
export const UNCONFIRMED = "MetYet couldn't confirm that just now. Check the latest here before trying again.";
