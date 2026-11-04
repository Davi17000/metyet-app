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
     stage area    the structured terms of the current stage and its actions
     conversation  human talk, reserved — messaging is not available yet

   CHAT PROVIDES CONTINUITY; STRUCTURED ACTIONS MOVE THE DEAL. The two are
   separate components and nothing flows from the conversation into a
   command. When messaging arrives it will be rendered in `Conversation` and
   sent through its own command; no message text is ever read for intent.

   No negotiation state is kept here: the moves are the shared
   `NegotiationControls`, sending through the callbacks the shell hands in,
   and what the server projects next is what this screen shows.
   ========================================================================== */
import React, { useEffect, useRef, useState } from "react";
import { useSender, statusLine, viewerSeat, isUnresolved, myPriceMove, dollars,
  isEndedDeal, priceOnTable, lastPriceMove } from "../negotiation.jsx";
import CardArt from "../card-art.jsx";
import { dealProgress } from "./deal-progress.js";
import { dealGlance, Progress, NegotiationControls } from "./deal-parts.jsx";
import { rows, text, gradeLine, printingLine } from "./present.js";

export default function DealWorkspace({ state, oppId, onBack, onBrowseCards = null,
  onCounterOffer = null, onAcceptOffer = null, onWithdrawOffer = null, onRefresh = null }) {
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

  return (
    <div className="mcs-ws" data-opp={deal.id}>
      {/* THE HEADER STAYS while the deal scrolls under it. */}
      <header className="mcs-ws-hd">
        <div className="mcs-ws-top">
          {back}
          <CardArt src={card && card.imageSmall} name={card && card.cardName}
            wrap="mcs-ws-art" plate="mcs-art-plate" decorative />
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
        <Conversation partnerName={partnerName} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ THE STAGE AREA
   Market Validation is the one stage production conducts. Only what the
   current decision needs (Milestone 2C.2): while the price is open, the
   Proposed Market Price, the one proposal on the table — named by who made
   it — and the Collector's moves; after agreement, the Agreed Market Price
   beside the Proposed Market Price, and Select Trade named as the next stage,
   not yet available. NO PRICE HISTORY HERE: every offer, counter and
   acceptance stays in the deal's canonical record (`priceThread`), untouched;
   this screen just does not recite it. */
function StageArea({ deal, me, partnerName, copy, progress, sender, onCounterOffer, onAcceptOffer, onWithdrawOffer }) {
  const open = isUnresolved(deal);
  const ended = isEndedDeal(deal);
  const agreed = !open && dollars(deal.agreedPrice);
  const terms = [copy ? gradeLine(copy) : null,
    deal.firmOnPrice === true ? "Firm on Price" : deal.firmOnPrice === false ? "Open to Offers" : null]
    .filter(Boolean).join(" · ");
  const prices = [];
  if (dollars(deal.listedPrice)) prices.push(["Proposed Market Price", dollars(deal.listedPrice), "listed"]);
  /* The proposal on the table, by whoever made it: the server's `turn` says
     whose move it is, so the other person made the last one. */
  const onTable = open ? priceOnTable(deal) : null;
  if (onTable != null) {
    const theirs = myPriceMove(deal, me);
    const opening = lastPriceMove(deal) === "offer";
    prices.push([theirs ? `${opening ? "Offer" : "Counteroffer"} from ${partnerName}`
      : opening ? "Your opening offer" : "Your counteroffer", dollars(onTable), theirs ? "live" : ""]);
  }
  if (agreed) prices.push(["Agreed Market Price", dollars(deal.agreedPrice), "agreed"]);

  return (
    <section className="mcs-ws-stage" aria-labelledby={`mcs-ws-stage-${deal.id}`}>
      <h2 className="mcs-ws-h2" id={`mcs-ws-stage-${deal.id}`}>Market Validation</h2>
      {terms ? <p className="mcs-ws-terms">{terms}</p> : null}
      {prices.length ? (
        <dl className="mcs-ws-prices">
          {prices.map(([k, v, tone]) => (
            <div key={k} className={tone || null}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      ) : null}

      {open && !myPriceMove(deal, me) ? (
        <p className="mcs-ws-say">{`${partnerName} can accept, counter or decline. You can withdraw your offer while you wait.`}</p>
      ) : null}
      {agreed && !ended ? (
        <p className="mcs-ws-say">
          {"Agreeing a market price doesn't complete the deal. "}
          {progress && progress.next
            ? `The next planned stage is ${progress.next}, which isn't available in MetYet yet — there's nothing more to do here for now.`
            : null}
        </p>
      ) : null}

      <NegotiationControls deal={deal} me={me} sender={sender} onCounterOffer={onCounterOffer}
        onAcceptOffer={onAcceptOffer} onWithdrawOffer={onWithdrawOffer} />

    </section>
  );
}

/* ------------------------------------------------------------ CONVERSATION
   RESERVED, NOT SIMULATED. Messaging is not available in production: there is
   no exposed command and no thread for a canonical deal yet. So this says so,
   draws no message and no input, and claims nothing is delivered or kept.
   When messaging ships, this component renders the thread and a composer
   anchored to the bottom of the workspace; nothing it sends changes the deal. */
function Conversation({ partnerName }) {
  return (
    <section className="mcs-ws-talk" aria-labelledby="mcs-ws-talk-h" data-messaging="unavailable">
      <h2 className="mcs-ws-h2" id="mcs-ws-talk-h">{`Conversation with ${partnerName}`}</h2>
      <p className="mcs-ws-note">
        Messaging isn't available in MetYet yet. When it is, your conversation about this deal will
        appear here. Messages won't change the deal — only the actions above do.
      </p>
    </section>
  );
}
