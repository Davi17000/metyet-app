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
import { rows, text, printingLine } from "./present.js";
import { dealGradeLine } from "../printing.js";
import { picturesOf, PhotoViewer } from "./card-viewer.jsx";
import { DealConversation } from "../deal-conversation.jsx";
import { useDealFreshness } from "../deal-freshness.js";
import { CopyRow, liveRows, takenOut, myMove, turnOf, isSelectingStage, isValuingStage,
  selectRefusal, tradeRows } from "../select-trade.jsx";
import { isDealingStage, valuedRows } from "../value-trade.jsx";
import { DealSummary } from "../deal-summary.jsx";
import ValueTradeArea from "./value-trade-area.jsx";

export default function DealWorkspace({ state, oppId, onBack, onBrowseCards = null,
  onCounterOffer = null, onAcceptOffer = null, onWithdrawOffer = null, onRefresh = null,
  onSendMessage = null, onHoldSelection = null, onReadyForSelection = null, onWithdrawTradeCard = null,
  onProposeMarket = null, onAcceptMarket = null, onProposePercent = null, onAcceptPercent = null }) {
  const me = viewerSeat(state);
  const deal = rows(state && state.opportunities).find((o) => o.id === oppId) || null;
  const partner = deal ? rows(state && state.partners).find((p) => p.id === deal.partnerId) || null : null;
  const partnerName = (partner && text(partner.name)) || "your Trusted Partner";
  const copy = deal ? rows(state && state.inventory).find((c) => c.invId === deal.invId) || null : null;
  const sender = useSender(onRefresh);
  /* FRESHNESS (M3A A3). Opening this deal reads the server again; so does
     coming back to the page, and every 15 seconds while it is visible and the
     deal is live. A change the check finds is said once, under whose turn it
     is; if checking fails, the deal's moves pause until it succeeds. */
  const live = !!deal && !isEndedDeal(deal) && !!(deal.turn && deal.turn.active);
  /* Value Trade's open box, confirmation and last word (M3B B4), kept here so
     a change the check finds can close an open box and say why. */
  const [vt, setVt] = useState({});
  useEffect(() => { setVt({}); }, [oppId]);
  const fresh = useDealFreshness({ state, seat: me, deals: live ? [oppId] : [], onRefresh, arrival: oppId,
    nameOf: () => partnerName,
    onChange: () => setVt((held) => (held.entry || held.confirming
      ? { ...held, entry: null, confirming: null, done: null, said: "This deal changed while you were answering — check the card and try again." }
      : { ...held, done: null })) });
  const frozen = fresh.failed;

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

  /* M3B B4: and the names of the cards held for it, once for the set, for
     Value Trade and the Deal Summary. */
  const tradeIds = deal ? [...new Set(tradeRows(deal).map((r) => r.canonicalCardId).filter(Boolean))] : [];
  const [named, setNamed] = useState({});
  useEffect(() => {
    if (!onBrowseCards || !tradeIds.length) return undefined;
    let current = true;
    (async () => {
      try {
        const answer = await onBrowseCards.describe(tradeIds);
        if (!current) return;
        const next = {};
        for (const c of rows(answer && answer.cards)) next[c.canonicalCardId] = c;
        setNamed((held) => ({ ...held, ...next }));
      } catch (error) { /* a row without a caption is still the copy */ }
    })();
    return () => { current = false; };
  }, [tradeIds.join(","), onBrowseCards]);

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
  const valuing = isValuingStage(deal);
  /* Every card valued: Deal, which has no control yet — shown read-only. */
  const dealing = isDealingStage(deal) && valuedRows(deal).length > 0;
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
        {fresh.notes[deal.id] && !fresh.failed ? <p className="mcs-fresh" role="status">{fresh.notes[deal.id]}</p> : null}
        {fresh.failed ? (
          <div className="mcs-fresh-fail" role="alert">
            <span>{fresh.ended ? "Your session has ended — sign in again to see the latest."
              : "Couldn't check for updates — what's shown may be out of date. Your moves are paused until MetYet can confirm the latest."}</span>
            {fresh.ended ? null : <button type="button" className="mcs-go" onClick={() => fresh.refreshNow()}>Refresh deal</button>}
          </div>
        ) : null}
      </header>

      <div className="mcs-ws-body">
        <StageArea deal={deal} me={me} partnerName={partnerName} copy={copy} progress={progress}
          sender={sender} onCounterOffer={onCounterOffer} onAcceptOffer={onAcceptOffer}
          onWithdrawOffer={onWithdrawOffer} frozen={frozen} valuing={valuing || dealing} />
        {isSelectingStage(deal) ? (
          <SelectTradeArea key={deal.id} deal={deal} state={state} me={me} partnerName={partnerName} frozen={frozen}
            onBrowseCards={onBrowseCards} onRefresh={onRefresh} onHoldSelection={onHoldSelection}
            onReadyForSelection={onReadyForSelection} onWithdrawTradeCard={onWithdrawTradeCard} />
        ) : null}
        {/* The last card left while it was being valued (M3B B4): back to
            choosing cards, and the Collector is told why. */}
        {isSelectingStage(deal) && vt.emptied ? <p className="mcs-sel-done mcs-vt-emptied" role="status">{vt.emptied}</p> : null}
        {/* VALUE TRADE AND THE DEAL SUMMARY (M3B B4). The cards valued one by
            one, then what the deal comes to, as a receipt reads. */}
        {valuing || dealing ? (
          <ValueTradeArea deal={deal} state={state} me={me} partnerName={partnerName} named={named}
            ui={vt} setUi={setVt} frozen={frozen} onRefresh={onRefresh}
            onProposeMarket={onProposeMarket} onAcceptMarket={onAcceptMarket}
            onProposePercent={onProposePercent} onAcceptPercent={onAcceptPercent}
            onWithdrawTradeCard={onWithdrawTradeCard} />
        ) : null}
        {valuing || dealing ? (
          <DealSummary cls="mcs" deal={deal} seat={me}
            featured={{ card, copy }} named={named}
            copies={new Map(rows(state && state.collectorCopies).map((b) => [b.id, b]))} />
        ) : null}
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
/* `valuing` (M3B B4): past Select Trade the cards' own area says what comes
   next, so the price area does not repeat it. */
function StageArea({ deal, me, partnerName, copy, progress, sender, onCounterOffer, onAcceptOffer, onWithdrawOffer, frozen = false, valuing = false }) {
  const open = isUnresolved(deal);
  const ended = isEndedDeal(deal);
  const agreed = !open && dollars(deal.agreedPrice);
  const terms = [copy ? dealGradeLine(copy) : null,
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
      {agreed && !ended && !valuing ? (
        <p className="mcs-ws-say">
          {"Agreeing a price doesn't complete the deal."}
          {progress && progress.next ? ` ${progress.next} comes next, and isn't available in MetYet yet.` : null}
        </p>
      ) : null}

      <NegotiationControls deal={deal} me={me} sender={sender} onCounterOffer={onCounterOffer}
        onAcceptOffer={onAcceptOffer} onWithdrawOffer={onWithdrawOffer} frozen={frozen} />

    </section>
  );
}

/* ------------------------------------------------------------ SELECT TRADE
   (M3A A3) The Trusted Partner chooses which of this Collector's Trade/Sell
   cards to consider; the Collector sees what was chosen, says "hold on" or
   "ready", and may take a card back out. What may be pressed is the server's
   `turn`; what is shown is the deal's own rows and this Collector's own
   copies. Nothing here is kept between visits: leaving and coming back shows
   exactly where the deal stands.

   Taking a card out is offered on THIS screen only while cards are being
   chosen. The domain allows it until both final agreements (M3A A1); Value
   Trade and Deal have no screen in production yet, and when they do, they
   offer it too. */
function SelectTradeArea({ deal, state, me, partnerName, onBrowseCards, onRefresh,
  onHoldSelection, onReadyForSelection, onWithdrawTradeCard, frozen = false }) {
  const sender = useSender(onRefresh, null, { sentence: selectRefusal("collector", partnerName), refreshAlways: true });
  const [confirming, setConfirming] = useState(null);   // the row id being taken out, or null
  const [done, setDone] = useState(null);
  const busy = !!sender.busy || frozen;
  const live = liveRows(deal);
  const out = takenOut(deal);
  const copies = new Map(rows(state && state.collectorCopies).map((b) => [b.id, b]));
  const valuing = isValuingStage(deal);
  const selecting = isSelectingStage(deal);
  const reason = turnOf(deal).reason;
  const who = partnerName;

  /* The rows' names, asked for once for the set. */
  const ids = [...new Set([...live, ...out].map((r) => r.canonicalCardId).filter(Boolean))];
  const [named, setNamed] = useState({});
  useEffect(() => {
    if (!onBrowseCards || !ids.length) return undefined;
    let current = true;
    (async () => {
      try {
        const answer = await onBrowseCards.describe(ids);
        if (!current) return;
        const next = {};
        for (const c of rows(answer && answer.cards)) next[c.canonicalCardId] = c;
        setNamed((held) => ({ ...held, ...next }));
      } catch (error) { /* a row without a caption is still the copy */ }
    })();
    return () => { current = false; };
  }, [ids.join(","), onBrowseCards]);

  const mine = myMove(deal, me, "more-cards", "adding-cards");
  /* M3B B4: Value Trade has its own area now, so this one is drawn only while
     cards are being chosen; the held-cards wording stays for a stage it has
     never seen reaching it. */
  const say = valuing ? "These cards are held for this deal."
    : reason === "adding-cards" ? `You're adding cards. Mark cards Trade / Sell in your Binders, then tell ${who} you're ready.`
      : reason === "more-cards" ? (live.length
        ? `${who} chose ${live.length === 1 ? "a card" : `${live.length} cards`} to consider. Add more Trade/Sell cards, or tell ${who} you're ready.`
        : `${who} asked if you have more cards to trade. Mark cards Trade / Sell in your Binders, then tell them you're ready.`)
        : reason === "close-selection" ? `${who} is finishing their choice.`
          : `${who} is choosing from your Trade/Sell cards. You'll see their choice here.`;

  const run = async (key, fn, ok) => { if (await sender.send(key, fn)) { setConfirming(null); setDone(ok); } };
  const nameOf = (r) => (named[r.canonicalCardId] && named[r.canonicalCardId].cardName) || "this card";

  return (
    <section className="mcs-sel" aria-label="Choosing cards to trade" data-select={deal.id}>
      <h2 className="mcs-ws-h2">{valuing ? "Cards held for this deal" : "Choosing cards to trade"}</h2>
      <p className={`mcs-sel-say${mine ? " mine" : ""}`} role="status">{say}</p>

      {live.length ? (
        <ul className="mcs-sel-list" aria-label={valuing ? "Held for this deal" : `Chosen by ${who}`}>
          {live.map((r) => (
            <CopyRow key={r.id} cls="mcs" row={r} copy={copies.get(r.binderId) || null} card={named[r.canonicalCardId] || null}
              tag={valuing ? "Held" : null}>
              {selecting && onWithdrawTradeCard && confirming !== r.id ? (
                <button type="button" className="mcs-go quiet" disabled={busy}
                  onClick={() => { sender.clear(); setDone(null); setConfirming(r.id); }}>Take out of this deal</button>
              ) : null}
            </CopyRow>
          ))}
        </ul>
      ) : null}

      {confirming && live.some((r) => r.id === confirming) ? (
        <div className="mcs-sel-confirm" role="group" aria-label="Take a card out">
          <p className="mcs-sel-line">
            {`Take ${nameOf(live.find((r) => r.id === confirming))} out of this deal? It stays in your Trade/Sell cards — this only takes it out of this deal.`}
          </p>
          <div className="mcs-sel-do">
            <button type="button" className="mcs-go mcs-go-primary" disabled={busy}
              onClick={() => run(`withdraw:${confirming}`, () => onWithdrawTradeCard(deal.id, confirming), "Taken out of this deal. It's still in your Trade/Sell cards.")}>
              {sender.busy && sender.busy.startsWith("withdraw:") ? "Taking it out…" : "Take it out"}
            </button>
            <button type="button" className="mcs-go quiet" disabled={busy} onClick={() => setConfirming(null)}>Keep it in</button>
          </div>
        </div>
      ) : null}

      {selecting ? (
        <div className="mcs-sel-do">
          {mine && onReadyForSelection ? (
            <button type="button" className="mcs-go mcs-go-primary" disabled={busy}
              onClick={() => run(`ready:${deal.id}`, () => onReadyForSelection(deal.id), `Done — ${who} can finish choosing.`)}>
              {sender.busy === `ready:${deal.id}` ? "Saying so…" : "I'm ready — they can finish choosing"}
            </button>
          ) : null}
          {reason !== "adding-cards" && onHoldSelection ? (
            <button type="button" className="mcs-go quiet" disabled={busy}
              onClick={() => run(`hold:${deal.id}`, () => onHoldSelection(deal.id), `${who} will wait while you add cards.`)}>
              {sender.busy === `hold:${deal.id}` ? "Saying so…" : "Hold on, I'm adding cards"}
            </button>
          ) : null}
        </div>
      ) : null}

      {out.length ? (
        <p className="mcs-sel-out">{`Taken out of this deal: ${out.map(nameOf).join(", ")}`}</p>
      ) : null}
      {sender.trouble ? <p className="mcs-df-trouble" role="status">{sender.trouble}</p>
        : done ? <p className="mcs-sel-done" role="status">{done}</p> : null}
    </section>
  );
}
