/* ============================================================================
   ONE DEAL, AS THE COLLECTOR SEES IT — THE PARTS BOTH SCREENS SHARE
   (Milestone 2C)

   Deal Flow shows an active deal at a glance; the Deal Workspace is where it
   is conducted. Both say where the deal stands in the same words and draw the
   same progress, so those live here once:

     dealGlance          the short status and the one action, from `turn`
     Progress            the journey bar, from deal-progress.js
     GoalProgress        the same bar, as a Goal card in Deal Flow says it
                         (Milestone 2C.1)
     OpeningOffer        the Collector's opening offer on one copy, in
                         dollars or as a percentage (Milestone 2C.2)
     NegotiationControls Accept / Counter / Withdraw, when the server says so

   NOTHING HERE DECIDES ANYTHING. Whose move it is and what may be pressed
   come from the server's `turn`, read through negotiation.jsx; the stage's
   place on the journey comes from deal-progress.js. No state of the
   negotiation is kept here — a press sends a command through the callback it
   was handed, and the server's next projection is what is shown after.
   ========================================================================== */
import React, { useState } from "react";
import { OfferEntry, readEntry, priceOnTable, isUnresolved, myPriceMove, dollars, lastPriceMove } from "../negotiation.jsx";
import { dealProgress } from "./deal-progress.js";
import { isSelectingStage, isValuingStage, myMove } from "../select-trade.jsx";
import { STATE_STYLE } from "./states.jsx";

/* ----------------------------------------------------- A DEAL, IN A GLANCE
   The short status, whether it is this Collector's move, and the one action
   that opens the deal. */
export function dealGlance(deal, me, partner) {
  if (!deal) return null;
  const who = partner || "your Trusted Partner";
  if (isUnresolved(deal)) {
    if (myPriceMove(deal, me)) {
      const offer = lastPriceMove(deal) === "offer";
      return { mine: true, status: `Your turn · Review ${offer ? "offer" : "counteroffer"}`,
        cta: offer ? "Review Offer" : "Review Counteroffer" };
    }
    return { mine: false, status: `Waiting for ${who}`, cta: "View Deal" };
  }
  /* SELECT TRADE (M3A A3): the partner chooses, the Collector answers. Read
     from the server's `turn` alone; nothing is decided. */
  if (isSelectingStage(deal)) {
    if (myMove(deal, me, "adding-cards")) return { mine: true, status: "Your turn · Adding cards", cta: "View Deal" };
    if (myMove(deal, me, "more-cards", "trade-reviewed")) return { mine: true, status: `Your turn · ${who} chose cards`, cta: "View Deal" };
    return { mine: false, status: `${who} is choosing cards`, cta: "View Deal" };
  }
  if (isValuingStage(deal)) return { mine: false, status: "Cards held for this deal", cta: "View Deal" };
  /* Agreed, and the next stage is one production does not offer yet. */
  const progress = dealProgress(deal);
  if (dollars(deal.agreedPrice) && progress && progress.known && progress.next) {
    return { mine: false, status: "Market price agreed", cta: "View Agreement" };
  }
  return { mine: false, status: "Deal in progress", cta: "View Deal" };
}

/* Ten steps, drawn; the label carries the meaning and the bar is a picture of
   it. A stage this build does not know gets its own name and no bar. */
export function Progress({ progress, compact = false }) {
  if (!progress) return null;
  if (!progress.known) {
    return progress.stage ? <p className="mcs-dg-plabel">{progress.stage}</p> : null;
  }
  const next = progress.finished
    ? `Next: ${progress.label}${progress.available ? "" : " — not yet available"}` : null;
  return (
    <div className={`mcs-dg-progress${compact ? " compact" : ""}`}>
      <p className="mcs-dg-plabel">{progress.finished || progress.label}</p>
      <Bar progress={progress} label={progress.finished || progress.label}
        text={next ? `${progress.finished}. ${next}` : progress.label} />
      {next ? <p className="mcs-dg-pnext">{next}</p> : null}
    </div>
  );
}

/* THE BAR ITSELF, one drawing for every place it appears. Completed steps in
   the founder's Primary green (Milestone 2C.1), read from the one mapping
   that holds it rather than spelled again; the colour only, never the Primary
   icon or label, so a deal is not mistaken for a collecting state. */
function Bar({ progress, label, text }) {
  return (
    <div className="mcs-dg-bar" role="progressbar" aria-label={label} aria-valuemin={0}
      aria-valuemax={progress.total} aria-valuenow={progress.done} aria-valuetext={text}
      style={{ "--done": STATE_STYLE.primary.color }}>
      {progress.steps.map((s) => (
        <span key={s.n} className={`mcs-dg-seg ${s.state}${s.available ? "" : " planned"}`} />
      ))}
    </div>
  );
}

/* ----------------------------------------------------- ON A GOAL CARD
   Where the Goal's one active deal stands, in three lines: the stage above
   the bar, the bar, and what is happening now below it (Milestone 2C.1).
   Everything is said by dealGlance and dealProgress — this only arranges it.
   While the price is open: the stage's name, then whose turn. Once agreed,
   with the next stage not shipped: "Market price agreed", then that the next
   stage is not yet available. A stage this build does not know keeps the
   safe fallback: its own name, the status, and no bar. */
export function GoalProgress({ deal, glance }) {
  const progress = dealProgress(deal);
  if (!progress || !glance) return null;
  if (!progress.known) {
    return (
      <div className="mcs-dg-progress card">
        {progress.stage ? <p className="mcs-dg-plabel">{progress.stage}</p> : null}
        <p className={`mcs-dg-status${glance.mine ? " mine" : ""}`}>{glance.status}</p>
      </div>
    );
  }
  const waitingOnNext = !isUnresolved(deal) && !progress.available && !!progress.next;
  const above = waitingOnNext ? glance.status : progress.name;
  const below = waitingOnNext ? `${progress.next} not yet available` : glance.status;
  return (
    <div className="mcs-dg-progress card">
      <p className="mcs-dg-plabel">{above}</p>
      <Bar progress={progress} label={`Deal progress: ${above}`}
        text={progress.finished ? `${progress.finished}. Next: ${progress.label}${progress.available ? "" : ", not yet available"}` : progress.label} />
      <p className={`mcs-dg-status${glance.mine ? " mine" : ""}`}>{below}</p>
    </div>
  );
}

/* ----------------------------------------------------- THE COLLECTOR'S MOVES
   Present only while the price is open. Accept and Counter only when the
   server says it is this Collector's move; Withdraw whenever the price is
   still open. After agreement nothing is drawn. */
/* `frozen` (M3A A3 freshness): the latest could not be confirmed, so no move is sent. */
export function NegotiationControls({ deal, me, sender, onCounterOffer, onAcceptOffer, onWithdrawOffer, frozen = false }) {
  const [countering, setCountering] = useState(false);
  if (!isUnresolved(deal)) {
    return sender.trouble ? <p className="mcs-df-trouble" role="status">{sender.trouble}</p> : null;
  }
  const myMove = myPriceMove(deal, me);
  const onTable = priceOnTable(deal);
  const busy = !!sender.busy || frozen;
  return (
    <div className="mcs-offer mcs-offer-live" aria-label="Your offer">
      {countering ? (
        <OfferEntry cls="mcs" verb="Send counter" busy={busy}
          listed={typeof deal.listedPrice === "number" && deal.listedPrice > 0 ? deal.listedPrice : null}
          onCancel={() => { sender.clear(); setCountering(false); }}
          onSubmit={async (price) => {
            if (await sender.send(`counter:${deal.id}`, () => onCounterOffer(deal.id, price))) setCountering(false);
          }} />
      ) : (
        <div className="mcs-offer-do">
          {myMove && onTable != null && onAcceptOffer ? (
            <button type="button" className="mcs-go mcs-go-primary" disabled={busy}
              onClick={() => sender.send(`accept:${deal.id}`, () => onAcceptOffer(deal.id))}>
              {sender.busy === `accept:${deal.id}` ? "Accepting…" : `Accept ${dollars(onTable)}`}
            </button>
          ) : null}
          {myMove && onCounterOffer ? (
            <button type="button" className="mcs-go" disabled={busy}
              onClick={() => { sender.clear(); setCountering(true); }}>Counter</button>
          ) : null}
          {onWithdrawOffer ? (
            <button type="button" className="mcs-go quiet" disabled={busy}
              onClick={() => sender.send(`withdraw:${deal.id}`, () => onWithdrawOffer(deal.id))}>
              {sender.busy === `withdraw:${deal.id}` ? "Withdrawing…" : "Withdraw offer"}
            </button>
          ) : null}
        </div>
      )}
      {sender.trouble ? <p className="mcs-df-trouble" role="status">{sender.trouble}</p> : null}
    </div>
  );
}

/* ----------------------------------------------------- THE OPENING OFFER
   (Milestone 2C.2) What the Collector offers for one copy, said in their own
   terms: a whole-dollar amount, or a whole percentage of the Trusted
   Partner's Proposed Market Price. The box starts EMPTY — the partner's price
   is shown above it as what it is, never pre-filled or offered as a
   placeholder, so nothing looks decided before the Collector types.

   NOTHING IS WORKED OUT HERE. The amount shown before sending is `readEntry`,
   the server's own expression (`Math.round(listed × percent)` against the
   price captured at the opening); what is sent is that same price object,
   and the server's answer is what happens next. Firm on Price is the
   server's rule: the opening is the Proposed Market Price, so there is
   nothing to type — only an explicit Send. */
export function OpeningOffer({ listed = null, firm = false, partner = "the Trusted Partner", busy = false,
  onSubmit, onCancel = null }) {
  const [mode, setMode] = useState("dollars");
  const [raw, setRaw] = useState("");
  const priced = typeof listed === "number" && listed > 0;
  const entry = readEntry(priced ? mode : "dollars", raw, listed);
  const cancel = onCancel ? (
    <button type="button" className="mcs-go quiet" disabled={busy} onClick={onCancel}>Cancel</button>
  ) : null;
  const basis = priced ? (
    <p className="mcs-oo-basis"><span>{`Proposed Market Price from ${partner}`}</span><strong>{dollars(listed)}</strong></p>
  ) : <p className="mcs-oo-basis"><span>{`${partner} hasn't listed a price`}</span></p>;

  if (firm && priced) {
    const fixed = Math.round(listed);
    return (
      <div className="mcs-oo" aria-label="Your opening offer">
        {basis}
        <p className="mcs-oo-note">
          {`${partner} is Firm on Price, so an opening offer is the Proposed Market Price. They can still reply with a different price.`}
        </p>
        <div className="mcs-oo-do">
          <button type="button" className="mcs-go mcs-go-primary" disabled={busy} onClick={() => onSubmit({ amount: fixed })}>
            {busy ? "Sending…" : `Send offer at ${dollars(fixed)}`}
          </button>
          {cancel}
        </div>
      </div>
    );
  }

  const percent = priced && mode === "percent";
  const ready = !!entry.price && !busy;
  return (
    <form className="mcs-oo" aria-label="Your opening offer"
      onSubmit={(e) => { if (e && e.preventDefault) e.preventDefault(); if (ready) onSubmit(entry.price); }}>
      {basis}
      {priced ? (
        <div className="mcs-oo-mode" role="group" aria-label="Offer as">
          {[["dollars", "Dollar Amount"], ["percent", "Percentage"]].map(([m, label]) => (
            <button key={m} type="button" aria-pressed={mode === m} className={mode === m ? "on" : ""}
              onClick={() => { if (mode !== m) { setMode(m); setRaw(""); } }}>{label}</button>
          ))}
        </div>
      ) : null}
      <label className="mcs-oo-field">
        {percent ? null : <span className="mcs-oo-unit" aria-hidden="true">$</span>}
        <input type="text" inputMode="numeric" autoComplete="off" value={raw}
          aria-label={percent ? "Offer, as a whole percentage of the Proposed Market Price" : "Offer, in whole dollars"}
          onChange={(e) => setRaw(e.target.value)} />
        {percent ? <span className="mcs-oo-unit" aria-hidden="true">%</span> : null}
      </label>
      {percent ? <p className="mcs-oo-hint">{`A percentage of the ${dollars(listed)} Proposed Market Price.`}</p> : null}
      {entry.problem ? <p className="mcs-oo-problem" role="status">{entry.problem}</p> : entry.price ? (
        <p className="mcs-oo-result" role="status">
          <span>{percent ? `Your opening offer · ${raw.trim()}% of ${dollars(listed)}` : "Your opening offer"}</span>
          <strong>{dollars(entry.amount)}</strong>
        </p>
      ) : null}
      <div className="mcs-oo-do">
        <button type="submit" className="mcs-go mcs-go-primary" disabled={!ready}>
          {busy ? "Sending…" : entry.price ? `Send offer · ${dollars(entry.amount)}` : "Send offer"}
        </button>
        {cancel}
      </div>
    </form>
  );
}
