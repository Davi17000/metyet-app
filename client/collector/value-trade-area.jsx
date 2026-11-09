/* ============================================================================
   VALUE TRADE, AS THE COLLECTOR CONDUCTS IT (M3B B4)

   The cards the Trusted Partner chose and holds for this deal, valued one by
   one in the Deal Workspace: each card's market value — the Collector opens
   it, then answers the partner's counter — and then the percentage of it the
   partner credits — the partner opens it, the Collector accepts or counters.
   The Collector may take any card out of the deal while it is being valued.

   EVERYTHING THAT MAY BE PRESSED IS THE SERVER'S, read through the shared
   value-trade.jsx exactly as the shop's screen reads it:

     a card's `owner`  which seat answers next on THAT card (domain cardOwner)
     the deal's `turn` which seat moves now; a card waiting on the Collector
                       while the turn is the partner's says "You're next"

   Nothing here works out a turn, rounds a figure or keeps a negotiation: a
   press sends one command through the callback the shell handed in, and the
   server's next projection is what is shown.

   A CARD THE PARTNER DECLINED stays here, read-only, with the partner's note
   and what it means: it is out of this deal and still in the Collector's
   Trade/Sell cards. A card the Collector took out says the same.

   WHEN VALUING ENDS. Every card agreed: the deal is in Deal, which has no
   control in MetYet yet — the values stay, read-only, and nothing more is
   offered (no taking a card out either: that is a Deal-stage move). No card
   left: the deal is back to choosing cards.

   `ui`/`setUi` are kept by the Deal Workspace, so a re-read that changes the
   deal can close an open box and say why. `frozen`: the latest could not be
   confirmed, so nothing is sent.
   ========================================================================== */
import React from "react";
import { useSender } from "../negotiation.jsx";
import { CopyRow, turnOf } from "../select-trade.jsx";
import { isDealingStage, valuedRows, leftRows, cardState, waitingOn, historyOf, creditOf, creditAt,
  valueRefusal, usd, pctText, ValueEntry, text, cardTag, leftNote, ownerOf } from "../value-trade.jsx";
import { rows } from "./present.js";

const cardsWord = (n) => `${n} ${n === 1 ? "card" : "cards"}`;

export default function ValueTradeArea({ deal, state, me, partnerName, named = {}, ui = {}, setUi, frozen = false,
  onRefresh = null, onProposeMarket = null, onAcceptMarket = null, onProposePercent = null, onAcceptPercent = null,
  onWithdrawTradeCard = null }) {
  const view = ui || {};
  const put = (patch) => setUi((held) => ({ ...(held || {}), ...patch }));
  const who = partnerName || "your Trusted Partner";
  const sender = useSender(onRefresh, (key, message) => put({ said: message }), {
    sentence: valueRefusal(me, partnerName),
    refreshAlways: true,
    onRefused: () => put({ entry: null, confirming: null, done: null }),
  });
  const busy = !!sender.busy || frozen;
  const dealing = isDealingStage(deal);
  const copies = new Map(rows(state && state.collectorCopies).map((b) => [b.id, b]));
  const live = valuedRows(deal);
  const left = leftRows(deal);
  const t = turnOf(deal);
  const mine = waitingOn(deal, me);
  const theirs = live.filter((r) => ownerOf(r) && ownerOf(r) !== me).length;
  const nameOf = (r) => (named[r.canonicalCardId] && text(named[r.canonicalCardId].cardName)) || "this card";

  const say = dealing ? "Every card's value is agreed. Next comes Deal, which isn't available in MetYet yet."
    : t.reason === "value" && t.seat === me ? `Your move — ${cardsWord(mine)} waiting on you.`
      : t.reason === "value" && t.seat && t.seat !== me
        ? (mine ? `Waiting for ${who} first — ${cardsWord(theirs)}. You're next on ${cardsWord(mine)}.`
          : `Waiting for ${who} — ${cardsWord(theirs)}.`)
        : `Waiting for ${who}.`;
  const myTurn = t.reason === "value" && !!me && t.seat === me;

  const act = async (key, run, done, extra = {}) => {
    if (await sender.send(key, run)) put({ entry: null, confirming: null, said: null, done, ...extra });
  };
  const withdraw = (row) => {
    const last = live.length === 1;
    return act(`withdraw:${row.id}`, () => onWithdrawTradeCard(deal.id, row.id),
      last ? null : `Taken out of this deal. It's still in your Trade/Sell cards.`,
      last ? { emptied: "You took out the last card, so this deal is back to choosing cards. It's still in your Trade/Sell cards." } : { emptied: null });
  };

  /* Whose figure is on the card, in the Collector's words. The partner's
     market value is always an answer to the Collector's opening; its % is
     an opening until the Collector has said one of their own. */
  const theirPercentWord = (row) => (Array.isArray(row.percentThread) && row.percentThread.some((e) => e && e.by === me)
    ? "countered" : "proposed");
  const marketFact = (row, st) => (row.agreedMarket != null ? `${usd(row.agreedMarket)} agreed`
    : st.phase !== "market" ? "Not agreed"
      : st.kind === "answer" ? `${who} countered ${usd(st.standing)}`
        : st.kind === "await" ? `You proposed ${usd(st.standing)}`
          : st.kind === "open" ? "Yours to propose" : "Not agreed");
  const percentFact = (row, st) => (row.agreedPercent != null ? `${pctText(row.agreedPercent)} agreed`
    : st.phase === "market" ? "After the market value is agreed"
      : st.phase !== "percent" ? "Not agreed"
        : st.kind === "answer" ? `${who} ${theirPercentWord(row)} ${pctText(st.standing)}`
          : st.kind === "await" ? `You countered ${pctText(st.standing)}`
            : st.kind === "await-open" ? `Waiting for ${who} to propose one` : "Not agreed");

  const body = (row, st, out) => {
    const trail = historyOf(row, me, who);
    const credit = creditOf(row);
    const entry = view.entry && view.entry.rowId === row.id ? view.entry : null;
    const confirming = view.confirming === row.id;
    const can = !out && !dealing;
    const gone = leftNote(st, row, me, who);
    return (
      <>
        <dl className="mcs-vt-facts">
          <div><dt>Market value</dt><dd>{marketFact(row, st)}</dd></div>
          <div><dt>Trade %</dt><dd>{percentFact(row, st)}</dd></div>
          <div><dt>Trade credit</dt><dd>{credit != null ? usd(credit) : out ? "Not counted" : "Not agreed yet"}</dd></div>
        </dl>
        {gone && gone.note ? <p className="mcs-vt-note">{gone.note}</p> : null}
        {gone && gone.next ? <p className="mcs-vt-next">{gone.next}</p> : null}
        {trail.length ? (
          <ol className="mcs-vt-trail" aria-label="Value history">
            {trail.map((e, i) => <li key={i} className={e.mine ? "mine" : "theirs"}>{e.line}</li>)}
          </ol>
        ) : null}
        {can && st.now && myTurn && !entry && !confirming ? (
          <div className="mcs-sel-do">
            {st.kind === "open" && st.phase === "market" && onProposeMarket ? (
              <button type="button" className="mcs-go mcs-go-primary" disabled={busy}
                onClick={() => { sender.clear(); put({ entry: { rowId: row.id, mode: "market", opening: true }, confirming: null, done: null, said: null }); }}>
                Propose a market value
              </button>
            ) : null}
            {st.kind === "answer" && st.phase === "market" && onAcceptMarket ? (
              <button type="button" className="mcs-go mcs-go-primary" disabled={busy}
                onClick={() => act(`accept-market:${row.id}`, () => onAcceptMarket(deal.id, row.id),
                  `Accepted ${usd(st.standing)} as this card's market value.`)}>
                {sender.busy === `accept-market:${row.id}` ? "Accepting…" : `Accept ${usd(st.standing)}`}
              </button>
            ) : null}
            {st.kind === "answer" && st.phase === "percent" && onAcceptPercent ? (
              <button type="button" className="mcs-go mcs-go-primary" disabled={busy}
                onClick={() => act(`accept-percent:${row.id}`, () => onAcceptPercent(deal.id, row.id),
                  `Agreed ${pctText(st.standing)} — ${usd(creditAt(row.agreedMarket, Math.round(st.standing * 100)))} trade credit.`)}>
                {sender.busy === `accept-percent:${row.id}` ? "Accepting…" : `Accept ${pctText(st.standing)}`}
              </button>
            ) : null}
            {st.kind === "answer" && (st.phase === "market" ? onProposeMarket : onProposePercent) ? (
              <button type="button" className="mcs-go" disabled={busy}
                onClick={() => { sender.clear(); put({ entry: { rowId: row.id, mode: st.phase }, confirming: null, done: null, said: null }); }}>
                Counter
              </button>
            ) : null}
          </div>
        ) : null}
        {can && entry ? (
          <ValueEntry cls="mcs" mode={entry.mode} market={row.agreedMarket} busy={busy}
            verb={entry.opening ? "Propose" : "Send counter"}
            onCancel={() => { sender.clear(); put({ entry: null }); }}
            onSubmit={(value) => (entry.mode === "market"
              ? act(`market:${row.id}`, () => onProposeMarket(deal.id, row.id, value), `Sent ${usd(value)} to ${who}.`)
              : act(`percent:${row.id}`, () => onProposePercent(deal.id, row.id, value), `Sent ${value}% to ${who}.`))} />
        ) : null}
        {can && onWithdrawTradeCard && !entry && !confirming ? (
          <div className="mcs-sel-do">
            <button type="button" className="mcs-go quiet" disabled={busy}
              onClick={() => { sender.clear(); put({ confirming: row.id, entry: null, done: null, said: null }); }}>
              Take out of this deal
            </button>
          </div>
        ) : null}
        {can && confirming ? (
          <div className="mcs-sel-confirm" role="group" aria-label="Take a card out">
            <p className="mcs-sel-line">
              {`Take ${nameOf(row)} out of this deal? It stays in your Trade/Sell cards and its history stays here. ${live.length > 1
                ? "The other cards stay as they are." : "It's the last card, so the deal goes back to choosing cards."}`}
            </p>
            <div className="mcs-sel-do">
              <button type="button" className="mcs-go mcs-go-primary" disabled={busy} onClick={() => withdraw(row)}>
                {sender.busy === `withdraw:${row.id}` ? "Taking it out…" : "Take it out"}
              </button>
              <button type="button" className="mcs-go quiet" disabled={!!sender.busy} onClick={() => put({ confirming: null })}>Keep it in</button>
            </div>
          </div>
        ) : null}
      </>
    );
  };

  const rowOf = (row, out) => {
    const st = cardState(deal, row, me);
    return (
      <CopyRow key={row.id} cls="mcs" row={row} copy={copies.get(row.binderId) || null} card={named[row.canonicalCardId] || null}
        tag={cardTag(st, me, who)} warn={st.now === true && myTurn} body={body(row, st, out)} />
    );
  };

  return (
    <section className="mcs-sel mcs-vt" aria-label="Valuing your trade cards" data-value={deal.id}>
      <h2 className="mcs-ws-h2">{dealing ? "Trade values agreed" : "Valuing your trade cards"}</h2>
      <p className={`mcs-sel-say${myTurn ? " mine" : ""}`} role="status">{say}</p>
      {live.length ? (
        <ul className="mcs-sel-list" aria-label="Cards in this deal">{live.map((r) => rowOf(r, false))}</ul>
      ) : null}
      {left.length ? (
        <>
          <p className="mcs-vt-sub">Out of this deal</p>
          <ul className="mcs-sel-list" aria-label="Out of this deal">{left.map((r) => rowOf(r, true))}</ul>
        </>
      ) : null}
      {sender.trouble || view.said ? <p className="mcs-df-trouble" role="status">{sender.trouble || view.said}</p>
        : view.done ? <p className="mcs-sel-done" role="status">{view.done}</p> : null}
    </section>
  );
}
