/* ============================================================================
   MARKET VALIDATION, AS BOTH SIDES SEE IT (Batch 3B)

   One small module for the two places a price is agreed: the Collector's Deal
   Flow, under the Goal, and the Trusted Partner's Opportunities. It holds the
   words and the entry box, so the two seats cannot drift into describing the
   same moment differently.

   IT DECIDES NOTHING. Whose move it is arrives on the deal as `turn` (the
   domain's one turn engine, projected); the price history is the server's
   `priceThread`; the captured price and Firm preference are the server's
   snapshot. Nothing here keeps a copy of a negotiation, predicts the next
   state, or rounds a number the server will round — a preview shows what the
   server's own arithmetic will give, and the server's answer replaces it.

   WHOLE NUMBERS ONLY. Dollars are whole dollars above $0; a percentage is a
   whole number above 0 of the price the shop listed when the offer opened.
   Anything else is said back to the person and not sent — never "fixed".

   Each seat styles it with its own prefix (`mcs` for a Collector, `tps` for a
   Trusted Partner); the class names are otherwise the same.
   ========================================================================== */

import React, { useRef, useState } from "react";
import { printingLine } from "./printing.js";

const dollars = (n) => (typeof n === "number" && Number.isFinite(n)
  ? "$" + Math.round(n).toLocaleString("en-US") : null);
const pct = (fraction) => `${Math.round(fraction * 100)}%`;

/* ------------------------------------------------------------ REFUSALS
   The server's refusal codes, said in a sentence a person can act on. A code
   this build has never seen gets the honest general answer, never a guess. */
const REFUSAL = Object.freeze({
  "firm-on-price": "This shop is Firm on Price, so an opening offer has to be their listed price.",
  "invalid-amount": "Offers are whole dollars above $0, or a whole percentage of the listed price.",
  "already-negotiating": "You already have an offer open on this card. Finish or withdraw that one first.",
  "not-your-turn": "This deal has changed since you opened it. The latest is shown here.",
  "wrong-stage": "This deal has moved past agreeing a price. The latest is shown here.",
  terminal: "This offer has already ended.",
  "copy-unavailable": "That copy isn't available any more.",
  "not-participant": "That deal isn't one you're part of.",
  "not-owner": "That isn't something you can do on this deal.",
  "no-goal": "That goal isn't there any more.",
  "goal-not-primary": "Offers start from a Primary goal. Make this card Primary to make an offer.",
  "no-relationship": "You're not connected with this shop.",
  "identity-mismatch": "That copy isn't the card your goal is for.",
  "criteria-mismatch": "That copy doesn't match what your goal asks for.",
  "reason-required": "An agreed deal can't be withdrawn from here.",
  "not-found": "That couldn't be found. It may have changed — the latest is shown here.",
  "command-unavailable": "That isn't available in this version of MetYet.",
});
export const refusalSentence = (code) => REFUSAL[code]
  || "That didn't go through, and nothing was changed.";
/* Refusals that mean "what you were looking at is out of date". After one of
   these the screen asks the server what is true now, rather than leaving a
   stale offer on the screen with live buttons under it. */
const STALE = new Set(["not-your-turn", "wrong-stage", "terminal", "copy-unavailable", "not-found"]);

/* ------------------------------------------------------------ SENDING
   One command at a time per deal, and the button that sent it says so. A
   second press while the first is in flight does nothing — the store would
   refuse it anyway — and a refusal is shown beside the deal it was about. */
export function useSender(onRefresh = null, report = null) {
  const [busy, setBusy] = useState(null);
  const [trouble, setTrouble] = useState(null);
  /* The guard is a ref, not the `busy` state: two presses in the same instant
     both read the state from before the first one re-rendered, and a state
     check lets the second through. The ref is set before anything is awaited. */
  const flight = useRef(null);
  const send = async (key, run) => {
    if (flight.current || typeof run !== "function") return false;
    flight.current = key;
    setBusy(key);
    setTrouble(null);
    if (report) report(key, null);
    try {
      const answer = await run();
      if (answer && answer.ok === false) {
        setTrouble(refusalSentence(answer.refused));
        /* Reported upward too: the re-read below can move this deal to another
           panel, or drop the copy altogether, and the message has to survive
           the move or the person is left with no answer at all. */
        if (report) report(key, refusalSentence(answer.refused));
        if (STALE.has(answer.refused) && onRefresh) {
          try { await onRefresh(); } catch (error) { /* the message already says enough */ }
        }
        return false;
      }
      return true;
    } catch (error) {
      setTrouble("MetYet couldn't confirm that just now. Check the latest here before trying again.");
      if (report) report(key, "MetYet couldn't confirm that just now. Check the latest here before trying again.");
      if (onRefresh) { try { await onRefresh(); } catch (e) { /* nothing more to say */ } }
      return false;
    } finally {
      flight.current = null;
      setBusy(null);
    }
  };
  return { busy, trouble, send, clear: () => setTrouble(null) };
}

/* ------------------------------------------------------------ ENTRY
   What a typed value means, worked out the same way the server will. For a
   percentage the preview is `Math.round(listed × fraction)` with the SAME
   fraction that is sent, which is the server's own expression; the server's
   answer is what is then shown. */
const WHOLE = /^[1-9]\d*$/;
export function readEntry(mode, raw, listed) {
  const typed = String(raw == null ? "" : raw).trim();
  if (!typed) return { price: null, amount: null, problem: null };
  if (!WHOLE.test(typed)) {
    return { price: null, amount: null,
      problem: mode === "percent"
        ? "Use a whole percentage above 0, like 90."
        : "Use whole dollars above $0 — no cents." };
  }
  const n = Number(typed);
  if (mode === "percent") {
    const percent = n / 100;
    return { price: { percent }, amount: Math.round(listed * percent), problem: null };
  }
  return { price: { amount: n }, amount: n, problem: null };
}

/* The box. `listed` is the price a percentage is OF — the shop's current price
   for an opening, the price captured at the opening for every counter after —
   and without one there is no percentage to offer. `fixed` is a Firm opening:
   there is nothing to type, only the shop's price to send. */
export function OfferEntry({ cls, listed = null, fixed = null, verb = "Send offer",
  busy = false, onSubmit, onCancel = null }) {
  const [mode, setMode] = useState("dollars");
  const [raw, setRaw] = useState("");
  const canPercent = typeof listed === "number" && listed > 0;
  const entry = readEntry(canPercent ? mode : "dollars", raw, listed);
  const cancel = onCancel ? (
    <button type="button" className={`${cls}-go quiet`} disabled={busy} onClick={onCancel}>Cancel</button>
  ) : null;

  if (fixed != null) {
    return (
      <div className={`${cls}-offer-entry`}>
        <p className={`${cls}-offer-line`}>
          {`This shop is Firm on Price, so an offer opens at ${dollars(fixed)}. They can still reply with a different price.`}
        </p>
        <div className={`${cls}-offer-do`}>
          <button type="button" className={`${cls}-go`} disabled={busy}
            onClick={() => onSubmit({ amount: fixed })}>
            {busy ? "Sending…" : `${verb} at ${dollars(fixed)}`}
          </button>
          {cancel}
        </div>
      </div>
    );
  }

  const ready = !!entry.price && !busy;
  return (
    <form className={`${cls}-offer-entry`}
      onSubmit={(e) => { if (e && e.preventDefault) e.preventDefault(); if (ready) onSubmit(entry.price); }}>
      {canPercent ? (
        <div className={`${cls}-offer-mode`} role="group" aria-label="Offer in">
          <button type="button" aria-pressed={mode === "dollars"}
            className={`${cls}-chip${mode === "dollars" ? " on" : ""}`}
            onClick={() => { setMode("dollars"); setRaw(""); }}>Dollars</button>
          <button type="button" aria-pressed={mode === "percent"}
            className={`${cls}-chip${mode === "percent" ? " on" : ""}`}
            onClick={() => { setMode("percent"); setRaw(""); }}>% of {dollars(listed)}</button>
        </div>
      ) : null}
      <label className={`${cls}-offer-field`}>
        <span className={`${cls}-offer-unit`}>{canPercent && mode === "percent" ? "%" : "$"}</span>
        <input type="text" inputMode="numeric" autoComplete="off" value={raw}
          aria-label={canPercent && mode === "percent" ? "Offer, as a percentage" : "Offer, in whole dollars"}
          placeholder={canPercent && mode === "percent" ? "90" : listed ? String(Math.round(listed)) : "100"}
          onChange={(e) => setRaw(e.target.value)} />
      </label>
      {entry.problem ? <p className={`${cls}-offer-problem`} role="status">{entry.problem}</p>
        : entry.price && entry.price.percent !== undefined
          ? <p className={`${cls}-offer-line`}>{`That's ${dollars(entry.amount)} — ${pct(entry.price.percent)} of ${dollars(listed)}.`}</p>
          : null}
      <div className={`${cls}-offer-do`}>
        <button type="submit" className={`${cls}-go`} disabled={!ready}>
          {busy ? "Sending…" : entry.amount ? `${verb} · ${dollars(entry.amount)}` : verb}
        </button>
        {cancel}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------ READING
   `seat` is who is looking ("collector" or "tp"); `other` is the other
   person's name. Each move in the Collector's words (Milestone 2D.3):
   "Casey's offer", "Your counter", "Casey accepted" — an offer and a
   counter stay distinct. */
const entryLine = (e, seat, other, listed) => {
  const me = e.by === seat;
  const label = e.type === "offer" || e.type === "counter"
    ? `${me ? "Your" : possessive(other)} ${e.type}`
    : e.type === "accept" ? `${me ? "You" : other} accepted` : `${me ? "You" : other} ${e.type}`;
  const basis = e.basis && typeof e.basis.percent === "number" && dollars(listed)
    ? ` (${pct(e.basis.percent)} of ${dollars(listed)})` : "";
  return `${label} ${dollars(e.amount)}${basis}`;
};

export function PriceHistory({ cls, deal, seat, other }) {
  const thread = threadOf(deal);
  if (!thread.length) return null;
  return (
    <ol className={`${cls}-offer-trail`} aria-label="Price history">
      {thread.map((e, i) => (
        <li key={i} className={e.by === seat ? "mine" : "theirs"}>{entryLine(e, seat, other, deal.listedPrice)}</li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------- WHERE A DEAL STANDS
   EVERY ANSWER HERE IS THE SERVER'S. The projection puts `turn` on each deal:
   whose move (`seat`), the turn engine's reason, the price on the table
   (`amount`), and two named domain predicates — `active` (D.isActive) and
   `priceOpen` (D.priceUnresolved). These helpers only read those fields, so
   there is no stage comparison and no turn logic in the browser; a row with no
   `turn` (an older server, a hand-built fixture) answers "nothing to do" —
   no controls, no live box — rather than guessing.

   THE ONE DELIBERATE READ OF THE THREAD. `threadOf` is the only place the
   price history is opened, and it is opened to SHOW it: the history list,
   each side's latest figure (`priceRows`), and whether the last price was an
   offer or a counter, for the wording. Neither
   decides anything — what may be pressed, and for how much, comes from `turn`.

   WHO IS LOOKING is `state.actor.seat`, the server's own statement of the
   signed-in seat, read with `viewerSeat`; nothing here names a seat. */
export const viewerSeat = (state) => (state && state.actor && typeof state.actor.seat === "string"
  ? state.actor.seat : null);
const turnOf = (deal) => (deal && deal.turn && typeof deal.turn === "object" ? deal.turn : null);
const threadOf = (deal) => {
  const thread = deal ? deal.priceThread : null;
  return Array.isArray(thread) ? thread.filter(Boolean) : [];
};

/* Still in play (server: active), and ended (the server's own outcome flag). */
export const isLiveDeal = (deal) => !!turnOf(deal) && turnOf(deal).active === true;
export const isEndedDeal = (deal) => !!deal && deal.declined === true;
/* Still agreeing a price (server: priceOpen). */
export const isUnresolved = (deal) => !!turnOf(deal) && turnOf(deal).priceOpen === true;
/* The server says it is this viewer's move to answer a price. */
export const myPriceMove = (deal, seat) => isUnresolved(deal) && !!seat
  && turnOf(deal).seat === seat && turnOf(deal).reason === "price";
/* The price on the table, as the turn engine states it. */
export const priceOnTable = (deal) => (turnOf(deal) && typeof turnOf(deal).amount === "number"
  ? turnOf(deal).amount : null);

/* Whether the latest price was an opening offer or a counter — for the
   wording only, like `statusLine`'s own read below. */
export const lastPriceMove = (deal) => {
  const thread = threadOf(deal);
  return thread.length ? thread[thread.length - 1].type || null : null;
};

/* ---------------------------------------------- THE PRICES SO FAR
   (Milestone 2D.2 refinement) The negotiation in a few rows, so the viewer
   can see the asking price, what they last offered and what the other side
   last countered, all at once. Like `PriceHistory`, a display read of the
   history through `threadOf`, plus `agreedPrice`; it decides nothing. What
   may be pressed, and for how much, is still the server's `turn`.

     asking   the price captured when the offer opened (`listedPrice`)
     yours    this viewer's latest offer or counter
     theirs   the other side's latest counter (or offer)
     agreed   only once a price was explicitly accepted (`agreedPrice`)

   `latest` marks the figure on the table while the price is open. Rows with
   nothing behind them are left out, never shown as empty or zero. */
const possessive = (name) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
const priced = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;
export function priceRows(deal, me, partner) {
  if (!deal) return [];
  const who = partner || "The other side";
  const moves = threadOf(deal)
    .filter((e) => e && (e.type === "offer" || e.type === "counter") && priced(e.amount));
  const lastWhere = (test) => { for (let i = moves.length - 1; i >= 0; i -= 1) if (test(moves[i])) return moves[i]; return null; };
  const latest = isUnresolved(deal) ? moves[moves.length - 1] || null : null;
  const yours = me ? lastWhere((e) => e.by === me) : null;
  const theirs = me ? lastWhere((e) => e.by !== me) : null;
  const out = [];
  if (priced(deal.listedPrice)) out.push({ key: "asking", label: `${possessive(who)} asking price`, amount: deal.listedPrice });
  if (yours) out.push({ key: "yours", label: "Your offer", amount: yours.amount, latest: yours === latest });
  if (theirs) {
    out.push({ key: "theirs", label: `${possessive(who)} ${theirs.type === "offer" ? "offer" : "counter"}`,
      amount: theirs.amount, latest: theirs === latest });
  }
  if (!isUnresolved(deal) && priced(deal.agreedPrice)) out.push({ key: "agreed", label: "Agreed price", amount: deal.agreedPrice });
  return out;
}

/* One sentence: where this deal stands, from this viewer. `stageName` is the
   viewer's own word for the stage, used only as a label. */
export function statusLine(deal, seat, other, stageName) {
  if (!deal) return null;
  if (isEndedDeal(deal)) {
    if (deal.outcome === "declined") {
      return deal.endedBy === seat ? "You declined this offer." : `${other} declined this offer.`;
    }
    /* THE SHOP'S CARD WENT ELSEWHERE OR OFF THE SHELF (M3A A1). Nobody ended
       it; the card stopped being available. One sentence true for both people,
       and nothing about another buyer. */
    if (deal.outcome === "card-unavailable") {
      return "This card is no longer available, so this deal has ended.";
    }
    /* Ended before any price was agreed is a withdrawn offer; after, an ended
       deal. Read from what the record holds, not from a stage. */
    if (deal.agreedPrice == null) {
      return deal.endedBy === seat ? "You withdrew this offer." : `${other} withdrew the offer.`;
    }
    return "This deal was ended.";
  }
  const t = turnOf(deal);
  if (!t) return null;
  if (t.active !== true) return "Completed.";
  if (t.priceOpen !== true) {
    /* Only what the row states: an agreed value when there is one, and the
       stage in this viewer's words. A ragged row says less, never "null". */
    const agreed = dollars(deal.agreedPrice) ? `Agreed at ${dollars(deal.agreedPrice)}.` : null;
    const next = stageName ? `Next: ${stageName}.` : null;
    return [agreed, next].filter(Boolean).join(" ") || null;
  }
  const amount = priceOnTable(deal);
  if (amount == null) return null;
  if (seat && t.seat === seat) {
    const thread = threadOf(deal);
    const what = thread.length && thread[thread.length - 1].type === "offer" ? "offer" : "counter";
    return `${other}'s ${what} is ${dollars(amount)}. Your move.`;
  }
  const last = threadOf(deal).slice(-1)[0];
  return `Waiting for ${other} to reply to your ${dollars(amount)} ${last && last.type === "offer" ? "offer" : "counter"}.`;
}

/* The captured terms: whether the shop was Firm or Open when the offer
   opened — the server's snapshot. The asking price captured with it is said
   once, as the record's own "Asking price" (Milestone 2D.3), so it is not
   repeated here. */
export const termsLine = (deal) => [
  deal && deal.firmOnPrice === true ? "Firm on Price" : deal && deal.firmOnPrice === false ? "Open to Offers" : null,
].filter(Boolean).join(" · ") || null;
/* THE EXACT CARD, IN ONE LINE: name, then set, number and version in the
   words every other production screen uses (`printingLine`, Milestone 2D.3) —
   "Normal", not the catalogue's `non_holo · not_applicable · en`. A card not
   yet described says nothing rather than guessing. */
export const cardLine = (card) => {
  if (!card) return null;
  return [card.cardName, printingLine(card)].filter(Boolean).join(" · ") || null;
};
export { dollars };
