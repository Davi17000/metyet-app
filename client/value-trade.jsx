/* ============================================================================
   VALUE TRADE — WHAT BOTH SEATS SHARE (M3B B3)

   Each card held for a deal is valued in two steps, card by card: its MARKET
   VALUE (the Collector opens it; then whoever is answering a proposal), then
   the TRADE PERCENTAGE of it the shop credits (the shop opens it; the same
   back-and-forth). A card with both agreed has a trade credit. The shop may
   decline a card at any point while valuing, with an optional short note.

   Both screens read the same things the server sent, and say them the same
   way, so they live here once (the shop's screen is B3; the Collector's, B4):

     each card's OWNER   `row.owner` — the domain's own `cardOwner`, projected:
                         which seat answers next on THIS card, or null
     the deal's TURN     `turn` — which seat moves NOW on the deal as a whole.
                         When both seats have cards waiting, the deal-level
                         turn says which of them goes first
     the card's FIGURES  the row's stored proposals, agreements and history

   A CARD WAITING ON YOU IS NOT ALWAYS YOUR MOVE. "Your move" on a card is
   `owner === you` AND `turn.seat === you`; a card waiting on you while the
   deal's turn is the other person's is "you're next". Nothing here works out
   whose move it is — `owner` and `turn` are the server's — it only reads them
   together and picks which stored figure to show.

   ONE ARITHMETIC, MIRRORED. A card's credit is `Math.round(market × percent)`
   only once both are agreed (domain `tradeValueOf`), and the cash difference
   is the agreed price minus the credits of the cards still in the deal
   (domain `calculatedBalance`): positive, the Collector pays the shop;
   negative, the shop pays the Collector. A test holds these to the domain's
   own functions. Nothing here is sent; the server's figures are the record.
   ========================================================================== */
import React, { useState } from "react";
import { tradeRows, inDeal } from "./select-trade.jsx";

const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
export const usd = (n) => (num(n) == null ? null : "$" + Math.round(n).toLocaleString("en-US"));
/* A stored fraction (0.8) as the whole percentage it is (80). */
export const wholePercentOf = (fraction) => (num(fraction) == null ? null : Math.round(fraction * 100));
export const pctText = (fraction) => (wholePercentOf(fraction) == null ? null : `${wholePercentOf(fraction)}%`);

const turnOf = (deal) => (deal && deal.turn && typeof deal.turn === "object" ? deal.turn : {});
export const ownerOf = (row) => (row && (row.owner === "tp" || row.owner === "collector") ? row.owner : null);
const otherSeat = (seat) => (seat === "tp" ? "collector" : "tp");

/* The deal is in Deal — every card valued — read from the turn engine's
   reasons, never a stage comparison. No Deal control is drawn for it here. */
const DEALING = new Set(["final", "agreed"]);
export const isDealingStage = (deal) => turnOf(deal).active === true && DEALING.has(turnOf(deal).reason);

/* ----------------------------------------------------------- THE CARDS */
/* Which step a card in the deal is at: its market value, then its
   percentage, then agreed. */
export const phaseOf = (row) => (row.agreedMarket == null ? "market" : row.agreedPercent == null ? "percent" : "agreed");
/* A card's credit: only both agreed, domain `tradeValueOf`. */
export const creditOf = (row) => (row && num(row.agreedMarket) != null && num(row.agreedPercent) != null
  ? Math.round(row.agreedMarket * row.agreedPercent) : null);
/* What a percentage WOULD credit against an agreed market value — a preview,
   domain `tradeValueAt`. */
export const creditAt = (market, wholePercent) => (num(market) != null && market > 0 && num(wholePercent) != null
  ? Math.round(market * (wholePercent / 100)) : null);

/* A card that left this deal while it was being valued — declined by the shop
   or taken out by the Collector — stays shown, read-only, with its history.
   A card removed while cards were still being CHOSEN never reached valuation
   and is Select Trade's history, not this one's. */
const VALUING_STAGES = new Set(["value-trade", "deal"]);
export const declinedHere = (row) => !!row && row.inclusion === "rejected" && VALUING_STAGES.has(row.declinedStage);
export const withdrawnHere = (row) => !!row && row.withdrawn === true && VALUING_STAGES.has(row.withdrawnStage);
export const valuedRows = (deal) => tradeRows(deal).filter(inDeal);
export const leftRows = (deal) => tradeRows(deal).filter((r) => declinedHere(r) || withdrawnHere(r));

/* WHERE ONE CARD STANDS, FOR ONE VIEWER. `kind`:
     declined / withdrawn   out of the deal; history only
     agreed                 both values agreed; credit counts
     answer                 a proposal of theirs is on the card for the viewer
     open                   nobody has proposed this step, and it is the viewer's to open
     await                  the viewer has proposed; waiting on the other person
     await-open             waiting on the other person to open this step
     unknown                the server said nothing this build can read: no controls
   `now`: the viewer may act on it this moment (it waits on them AND it is
   their turn on the deal). `next`: it waits on them, but the deal's turn is
   the other person's. */
export function cardState(deal, row, seat) {
  if (row && row.inclusion === "rejected") return { kind: "declined", phase: null };
  if (row && row.withdrawn === true) return { kind: "withdrawn", phase: null };
  const phase = phaseOf(row);
  if (phase === "agreed") return { kind: "agreed", phase };
  const owner = ownerOf(row);
  if (!owner || !seat) return { kind: "unknown", phase };
  const t = turnOf(deal);
  const mine = phase === "market" ? (seat === "tp" ? row.tpMarket : row.collectorMarket)
    : (seat === "tp" ? row.tpPercent : row.collectorPercent);
  const theirs = phase === "market" ? (seat === "tp" ? row.collectorMarket : row.tpMarket)
    : (seat === "tp" ? row.collectorPercent : row.tpPercent);
  if (owner === seat) {
    const myTurn = t.active === true && t.reason === "value" && t.seat === seat;
    return { kind: num(theirs) != null ? "answer" : "open", phase, standing: num(theirs), now: myTurn, next: !myTurn };
  }
  return { kind: num(mine) != null ? "await" : "await-open", phase, standing: num(mine), now: false, next: false };
}

/* A CARD'S TAG, AND WHAT A CARD OUT OF THE DEAL MEANS, in the viewer's words
   (M3B B4) — said here once so neither screen names a row's stored state.
   `other` is the other person's name. */
export function cardTag(st, seat, other) {
  if (st.kind === "agreed") return "Agreed";
  if (st.kind === "declined") return seat === "tp" ? "Declined by you" : `Declined by ${other}`;
  if (st.kind === "withdrawn") return seat === "tp" ? `Taken out by ${other}` : "You took this out";
  if (st.kind === "answer" || st.kind === "open") return st.now ? "Your move" : `You're next, after ${other}`;
  if (st.kind === "await" || st.kind === "await-open") return `Waiting for ${other}`;
  return null;
}
export const isOut = (st) => st.kind === "declined" || st.kind === "withdrawn";
export function leftNote(st, row, seat, other) {
  if (!isOut(st)) return null;
  const note = st.kind === "declined" && text(row && row.declineNote) ? text(row.declineNote) : null;
  if (seat === "tp") return { note: note ? `Your note: “${note}”` : null, next: null };
  return { note: note ? `Note from ${other}: “${note}”` : null,
    next: st.kind === "declined"
      ? `It's out of this deal and still in your Trade/Sell cards. You can ask ${other} about it in the conversation below.`
      : "It's out of this deal and still in your Trade/Sell cards." };
}

/* Cards waiting on each seat — read from `owner`, for the deal's headline. */
export const waitingOn = (deal, seat) => valuedRows(deal).filter((r) => ownerOf(r) === seat).length;

/* ----------------------------------------------------------- HISTORY
   Each step's thread as it was said, oldest first: the first proposal on a
   step "proposed", a later one "countered", and "accepted". */
export function historyOf(row, seat, other) {
  const out = [];
  const say = (e, figure, step, first) => {
    const me = e.by === seat;
    const whoSaid = me ? "You" : other;
    const verb = e.type === "accept" ? "accepted" : first ? "proposed" : "countered";
    return { mine: me, line: `${whoSaid} ${verb} ${figure}`, step };
  };
  let opened = false;
  for (const e of (Array.isArray(row && row.valueThread) ? row.valueThread : []).filter(Boolean)) {
    out.push(say(e, `${usd(e.amount)} market value`, "market", e.type === "propose" && !opened));
    if (e.type === "propose") opened = true;
  }
  opened = false;
  for (const e of (Array.isArray(row && row.percentThread) ? row.percentThread : []).filter(Boolean)) {
    out.push(say(e, `${pctText(e.percent)} trade credit`, "percent", e.type === "propose" && !opened));
    if (e.type === "propose") opened = true;
  }
  return out;
}

/* ----------------------------------------------------------- THE CASH
   The provisional cash difference from AGREED credits only: cards still being
   valued count for nothing until both their values are agreed. */
export function cashPicture(deal) {
  const live = valuedRows(deal);
  const credits = live.map(creditOf);
  const agreed = credits.filter((c) => c != null);
  const credit = agreed.reduce((a, c) => a + c, 0);
  const price = deal && num(deal.agreedPrice) != null ? deal.agreedPrice : null;
  const balance = price == null ? null : price - credit;
  return { price, credit, agreedCount: agreed.length, pendingCount: live.length - agreed.length, cardCount: live.length,
    balance, direction: balance == null ? "unknown" : balance > 0 ? "collector-to-tp" : balance < 0 ? "tp-to-collector" : "even",
    amount: balance == null ? null : Math.abs(balance) };
}

/* ----------------------------------------------------------- ENTRY
   What was typed, read the way the server will check it. Never rounded or
   corrected: anything else is said back and not sent. */
const WHOLE = /^[1-9]\d*$/;
export function readValue(mode, raw) {
  const typed = String(raw == null ? "" : raw).trim();
  if (!typed) return { value: null, problem: null };
  if (mode === "percent") {
    if (!WHOLE.test(typed) || Number(typed) > 100) return { value: null, problem: "Use a whole percentage from 1 to 100, like 80." };
    return { value: Number(typed), problem: null };
  }
  if (!WHOLE.test(typed) || !Number.isSafeInteger(Number(typed))) return { value: null, problem: "Use whole dollars above $0 — no cents." };
  return { value: Number(typed), problem: null };
}
/* A decline note: optional, one short line, 140 characters at most — counted
   as the server counts it, after collapsing spaces, by character (an emoji is
   one). */
export const NOTE_MAX = 140;
export const tidyNote = (raw) => (typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "");
export const noteLength = (raw) => [...tidyNote(raw)].length;

/* ----------------------------------------------------------- REFUSALS
   Value Trade's refusals in a sentence a person can act on. Every one means
   the card or the deal is not what the screen showed, so the screen re-reads
   after any of them. A code not listed falls through to the shared table. */
export const valueRefusal = (seat, other) => (code) => {
  const them = other || (seat === "tp" ? "the collector" : "your Trusted Partner");
  const TABLE = {
    "not-your-turn": `This card is waiting on ${them} right now. The latest is shown.`,
    "wrong-stage": "This card has moved on since you looked. The latest is shown.",
    "invalid-amount": "Market values are whole dollars above $0, and percentages whole numbers from 1 to 100.",
    "not-found": "That card isn't in this deal any more. The latest is shown.",
    "nothing-to-accept": "That card has already moved on. The latest is shown.",
    "message-too-long": `A note can be at most ${NOTE_MAX} characters.`,
    "message-empty": "That note couldn't be read. Try again without it.",
    "no-relationship": seat === "tp"
      ? `You're no longer connected with ${them}, so cards can't be valued in this deal. You can still decline a card.`
      : `You're no longer connected with ${them}, so cards can't be valued in this deal.`,
    "copy-unavailable": "The card this deal is for isn't available any more. The latest is shown.",
    "copy-committed": "The card this deal is for isn't available any more. The latest is shown.",
    terminal: "This deal has ended.",
  };
  return TABLE[code] || null;
};
export { text };

/* ----------------------------------------------------------- THE BOX
   (Moved here from the shop's Opportunities in M3B B4, unchanged, so both
   seats type a value into the same box.) One whole number: dollars for a
   market value, a percentage (1–100) for a trade %. Nothing is filled in. A
   percentage previews the credit it would give against the agreed market
   value — the domain's own rounding. `cls` is the seat's class prefix. */
export function ValueEntry({ cls, mode, market = null, verb, busy = false, onSubmit, onCancel }) {
  const [raw, setRaw] = useState("");
  const entry = readValue(mode, raw);
  const ready = entry.value != null && !busy;
  const preview = mode === "percent" && entry.value != null ? creditAt(market, entry.value) : null;
  return (
    <form className={`${cls}-offer-entry`}
      onSubmit={(e) => { if (e && e.preventDefault) e.preventDefault(); if (ready) onSubmit(entry.value); }}>
      <label className={`${cls}-offer-field`}>
        <span className={`${cls}-offer-unit`}>{mode === "percent" ? "%" : "$"}</span>
        <input type="text" inputMode="numeric" autoComplete="off" value={raw}
          aria-label={mode === "percent" ? "Trade percentage, a whole number from 1 to 100" : "Market value, in whole dollars"}
          onChange={(e) => setRaw(e.target.value)} />
      </label>
      {entry.problem ? <p className={`${cls}-offer-problem`} role="status">{entry.problem}</p>
        : preview != null ? <p className={`${cls}-offer-line`}>{`That's ${usd(preview)} of trade credit on ${usd(market)}.`}</p> : null}
      <div className={`${cls}-offer-do`}>
        <button type="submit" className={`${cls}-go${cls === "mcs" ? " mcs-go-primary" : ""}`} disabled={!ready}>
          {busy ? "Sending…" : entry.value != null ? `${verb} · ${mode === "percent" ? `${entry.value}%` : usd(entry.value)}` : verb}
        </button>
        <button type="button" className={`${cls}-go quiet`} disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
