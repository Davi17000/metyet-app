/* ============================================================================
   THE DEAL WORKSPACE — ONE DEAL, FULL SCREEN (Milestone 2C)

     Deal Flow -> a Goal -> View Deal -> this screen -> Back to that Goal

   Where a Collector conducts one deal. It replaces the whole Collector screen
   (it is not a drawer or a dialog) and is identified by the opportunity's own
   id. Everything shown is the server's projection of THIS Collector's deals:
   the id is looked up in `state.opportunities`, which holds only their own,
   and an id that is not there — ended long ago, somebody else's, mistyped —
   is said to be unavailable. Opening this screen sends nothing, creates
   nothing and reserves nothing.

   THREE AREAS, AND ONE RULE BETWEEN THEM:

     header        back, the card, the partner, the stage, whose turn, progress
                   — the card's picture opens the card viewer, at every stage
     stage area    the prices so far and the Collector's moves
     conversation  the deal's own thread and a composer (Milestone 2D.2)

   CHAT PROVIDES CONTINUITY; STRUCTURED ACTIONS MOVE THE DEAL. The two are
   separate components and nothing flows from the conversation into a
   command. The thread is the shared `DealConversation`, sending through
   `onSendMessage` — the one messaging command — and no message text is ever
   read for intent.

   No negotiation state is kept here: the moves are the shared
   `NegotiationControls`, sending through the callbacks the shell hands in,
   and what the server projects next is what this screen shows.
   ========================================================================== */
import React, { useEffect, useRef, useState } from "react";
import { useSender, statusLine, viewerSeat, isUnresolved, myPriceMove, dollars,
  isEndedDeal, priceRows } from "../negotiation.jsx";
import CardArt from "../card-art.jsx";
import { dealProgress } from "./deal-progress.js";
import { dealGlance, Progress, NegotiationControls } from "./deal-parts.jsx";
import { rows, text, gradeLine, printingLine } from "./present.js";
import { picturesOf, PhotoViewer } from "./card-viewer.jsx";
import { DealConversation } from "../deal-conversation.jsx";

export default function DealWorkspace({ state, oppId, onBack, onBrowseCards = null,
  onCounterOffer = null, onAcceptOffer = null, onWithdrawOffer = null, onRefresh = null,
  onSendMessage = null }) {
  const me = viewerSeat(state);
  const deal = rows(state && state.opportunities).find((o) => o.id === oppId) || null;
  const partner = deal ? rows(state && state.partners).find((p) => p.id === deal.partnerId) || null : null;
  const partnerName = (partner && text(partner.name)) || "your Trusted Partner";
  const copy = deal ? rows(state && state.inventory).find((c) => c.invId === deal.invId) || null : null;
  const sender = useSender(onRefresh);

  /* The card's name and printing, asked of the catalogue the way every other
     Collector screen asks it. */
  const [card, setCard] = useState(null);
  const cardId = deal ? deal.canonicalCardId : null;
  useEffect(() => {
    if (!onBrowseCards || !cardId) return undefined;
    let current = true;
    (async () => {
      try {
        const answer = await onBrowseCards.describe([cardId]);
        const found = rows(answer && answer.cards).find((c) => c.canonicalCardId === cardId);
        if (current && found) setCard(found);
      } catch (error) { /* a deal without a caption is still the deal */ }
    })();
    return () => { current = false; };
  }, [cardId, onBrowseCards]);

  /* Arriving starts at the top of the deal, with focus on its title, so a
     keyboard or screen reader starts there rather than on a button that no
     longer exists. */
  const titleRef = useRef(null);
  /* The card viewer, open or not. Closing returns focus to the picture. */
  const [viewing, setViewing] = useState(false);
  const thumbRef = useRef(null);
  const closeViewer = () => {
    setViewing(false);
    if (thumbRef.current && thumbRef.current.focus) thumbRef.current.focus();
  };
  useEffect(() => {
    if (typeof window !== "undefined" && window.scrollTo) window.scrollTo(0, 0);
    if (titleRef.current && titleRef.current.focus) titleRef.current.focus({ preventScroll: true });
  }, [oppId]);

  const back = (
    <button type="button" className="mcs-ws-back" onClick={onBack} aria-label="Back to Deal Flow">
      <span aria-hidden="true" className="mcs-ws-arrow" />
    </button>
  );

  if (!deal) {
    return (
      <div className="mcs-ws">
        <header className="mcs-ws-hd">
          <div className="mcs-ws-top">
            {back}
            <h1 className="mcs-ws-title" tabIndex={-1} ref={titleRef}>Deal not available</h1>
          </div>
        </header>
        <div className="mcs-ws-body">
          <p className="mcs-ws-note">
            This deal isn't available. It may have ended, or the link may be out of date. Nothing has been changed.
          </p>
          <button type="button" className="mcs-go" onClick={onBack}>Back to Deal Flow</button>
        </div>
      </div>
    );
  }

  const progress = dealProgress(deal);
  const glance = isEndedDeal(deal) ? null : dealGlance(deal, me, partnerName);
  const printing = printingLine(card);
  const pics = picturesOf(copy, card);

  return (
    <div className="mcs-ws" data-opp={deal.id}>
      {/* THE HEADER STAYS while the deal scrolls under it. */}
      <header className="mcs-ws-hd">
        <div className="mcs-ws-top">
          {back}
          <button type="button" className="mcs-ws-artbtn" ref={thumbRef} onClick={() => setViewing(true)}
            aria-label={`View card: ${(card && card.cardName) || "this card"}, ${pics.catalog ? "catalog image" : "no picture yet"}`}>
            <CardArt src={card && card.imageSmall} name={card && card.cardName}
              wrap="mcs-ws-art" plate="mcs-art-plate" decorative />
          </button>
          <div className="mcs-ws-id">
            <h1 className="mcs-ws-title" tabIndex={-1} ref={titleRef}>{(card && card.cardName) || "Your deal"}</h1>
            <p className="mcs-ws-sub">{[printing, `with ${partnerName}`].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        {glance ? (
          <p className={`mcs-ws-turn${glance.mine ? " mine" : ""}`} role="status">{glance.status}</p>
        ) : (
          <p className="mcs-ws-turn ended" role="status">{statusLine(deal, me, partnerName)}</p>
        )}
        {glance ? <Progress progress={progress} compact /> : null}
      </header>

      <div className="mcs-ws-body">
        <StageArea deal={deal} me={me} partnerName={partnerName} copy={copy} progress={progress}
          sender={sender} onCounterOffer={onCounterOffer} onAcceptOffer={onAcceptOffer}
          onWithdrawOffer={onWithdrawOffer} />
        {/* Keyed by the deal: a draft, a nonce and a send in flight belong to
            ONE deal, and are never carried onto another one opened after. */}
        <DealConversation key={deal.id} cls="mcs" deal={deal} state={state} me={me} other={partnerName}
          onSendMessage={onSendMessage} onRefresh={onRefresh} />
      </div>
      {viewing ? (
        <PhotoViewer id={`ws-${deal.id}`} pics={pics} card={card} copy={copy} partner={partnerName}
          onClose={closeViewer} />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ THE STAGE AREA
   Market Validation is the one stage production conducts, titled for the
   Collector as what it is: Price negotiation (Milestone 2D.2 refinement).
   The prices so far (`priceRows`): the asking price, the Collector's latest
   offer and the partner's latest counter, the one on the table marked; an
   Agreed price only once one was explicitly accepted. They stay through
   agreement and after a deal ends, so the context is never lost. The moves
   are the shared `NegotiationControls`; what may be pressed is the server's
   `turn`, never these rows. */
function StageArea({ deal, me, partnerName, copy, progress, sender, onCounterOffer, onAcceptOffer, onWithdrawOffer }) {
  const open = isUnresolved(deal);
  const ended = isEndedDeal(deal);
  const agreed = !open && dollars(deal.agreedPrice);
  const terms = [copy ? gradeLine(copy) : null,
    deal.firmOnPrice === true ? "Firm on Price" : deal.firmOnPrice === false ? "Open to Offers" : null]
    .filter(Boolean).join(" · ");
  const prices = priceRows(deal, me, partnerName);

  return (
    <section className="mcs-ws-stage" aria-labelledby={`mcs-ws-stage-${deal.id}`}>
      <h2 className="mcs-ws-h2" id={`mcs-ws-stage-${deal.id}`}>Price negotiation</h2>
      {terms ? <p className="mcs-ws-terms">{terms}</p> : null}
      {prices.length ? (
        <dl className="mcs-ws-prices">
          {prices.map((r) => (
            <div key={r.key} className={[r.key, r.latest ? "latest" : null].filter(Boolean).join(" ")}>
              <dt>{r.label}{r.latest ? " " : null}{r.latest ? <span className="mcs-ws-latest">Latest</span> : null}</dt>
              <dd>{dollars(r.amount)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {open && !myPriceMove(deal, me) ? (
        <p className="mcs-ws-say">{`${partnerName} can accept, counter or decline.`}</p>
      ) : null}
      {agreed && !ended ? (
        <p className="mcs-ws-say">
          {"Agreeing a price doesn't complete the deal."}
          {progress && progress.next ? ` ${progress.next} comes next, and isn't available in MetYet yet.` : null}
        </p>
      ) : null}

      <NegotiationControls deal={deal} me={me} sender={sender} onCounterOffer={onCounterOffer}
        onAcceptOffer={onAcceptOffer} onWithdrawOffer={onWithdrawOffer} />

    </section>
  );
}
