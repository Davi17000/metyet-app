/* ============================================================================
   DEAL FRESHNESS — BOTH PEOPLE SEE THE DEAL AS IT STANDS (M3A A3)

   A deal is two people coordinating, often on the phone or in a message
   outside MetYet. Neither should act on, or wait on, a picture of the deal
   that has since moved. So a screen showing a live deal asks the server again:

     on arrival        when the deal (or the list of deals) is opened
     on return         when the page becomes visible again or regains focus
     while shown       every 15 seconds while the page is visible, backing off
                       15 → 30 → 60 → 120 seconds after failures

   It asks through `onRefresh` — the same re-read every screen is already
   handed — and nothing else: no store, no network, no new route. One check at
   a time; one timer per screen; nothing while the page is hidden; nothing
   after the session has ended.

   WHAT COUNTS AS A CHANGE is decided per deal, never by the world's version
   (which moves for anybody's write anywhere): the deal's turn, its rows, when
   it was last moved, how it ended, the status of the copies it can involve,
   and whether the other person is still connected. Unrelated activity says
   nothing. A change found by a check is said once, quietly, in words naming
   what happened where that is known; a change the person made themselves is
   not a check's to announce.

   WHEN A CHECK FAILS the screen is told, and says so; it is up to the screen
   to hold back consequential actions until a check succeeds again.

   NOTHING HERE IS A RECORD. A note is what this screen noticed, not deal
   history — it is never stored, sent, or shown to the other person.
   ========================================================================== */
import { useCallback, useEffect, useRef, useState } from "react";
import { tradeRows } from "./select-trade.jsx";

export const FRESH_MS = 15000;
export const BACKOFF_MS = Object.freeze([15000, 30000, 60000, 120000]);

const list = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const env = () => (typeof globalThis !== "undefined" ? globalThis : {});

/* ------------------------------------------------- ONE DEAL, AS A FINGERPRINT
   Everything that can change what a person should do next on this deal, read
   from the projection they already hold. `seat` is the viewer's: a shop sees
   the status of every copy of this Collector's it can see; a Collector, her
   own copies this deal names. */
export function dealPrint(state, dealId, seat) {
  const deal = list(state && state.opportunities).find((o) => o.id === dealId) || null;
  if (!deal) return { gone: true };
  const t = deal.turn || {};
  const rows = tradeRows(deal).map((r) => [r.id, r.binderId, r.inclusion || null, r.withdrawn === true, r.reservedAt || null]);
  const named = new Set(rows.map((r) => r[1]));
  const copies = list(state.collectorCopies)
    .filter((b) => (seat === "tp" ? b.collectorId === deal.collectorId : named.has(b.id)))
    .map((b) => [b.id, b.status || null]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const connected = seat === "tp"
    ? list(state.collectors).some((c) => c.id === deal.collectorId)
    : list(state.partners).some((p) => p.id === deal.partnerId);
  return { gone: false, seat: t.seat || null, reason: t.reason || null, active: t.active === true,
    priceOpen: t.priceOpen === true, amount: t.amount == null ? null : t.amount, updated: deal.updated || null,
    agreed: deal.agreedPrice == null ? null : deal.agreedPrice, ended: deal.declined === true, outcome: deal.outcome || null,
    live: rows.filter((r) => r[2] === "accepted" && !r[3]).map((r) => r[0]), rows, copies, connected };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* What changed, in words — only what the two fingerprints show. */
export function changeNote(before, after, seat, other) {
  const who = other || (seat === "tp" ? "The collector" : "Your Trusted Partner");
  if (after.gone) return "Updated — this deal is no longer shown.";
  if (before.connected && !after.connected) return `Updated — you're no longer connected with ${who}.`;
  if (!before.ended && after.ended) return "Updated — this deal has ended.";
  if (before.active && !after.active) return "Updated — this deal is complete.";
  if (before.reason !== after.reason) {
    if (after.reason === "close-selection" && seat === "tp") return `Updated — ${who} is ready.`;
    if (after.reason === "adding-cards" && seat === "tp") return `Updated — ${who} is adding cards.`;
    if (after.reason === "more-cards" && seat !== "tp") return `Updated — ${who} chose cards.`;
    if (after.reason === "value" || after.reason === "values-settled") return "Updated — the chosen cards are now held for this deal.";
    if (after.reason === "select-trade" && before.reason === "price") return "Updated — the price was agreed.";
  }
  if (after.live.length < before.live.length) {
    return seat === "tp" ? `Updated — ${who} took a card out of this deal.` : `Updated — ${who} removed a card.`;
  }
  if (after.live.length > before.live.length) return seat === "tp" ? "Updated — a card was added." : `Updated — ${who} added a card.`;
  if (before.amount !== after.amount && after.amount != null) return `Updated — ${who} answered on price.`;
  if (!same(before.copies, after.copies)) return "Updated — a card's availability changed.";
  return "Updated — the latest is shown.";
}

/* ------------------------------------------------------------- THE HOOK
   `deals`   the ids of the live deals this screen shows (none: re-read only)
   `poll`    whether to check every 15s while visible (a list screen: no)
   `nameOf`  the other person's name for a deal, for the note
   `onChange(dealId, note)` told of each change a CHECK found
   Returns `{ failed, ended, notes, refreshNow }`. */
export function useDealFreshness({ state, seat, deals = [], nameOf = () => null, onRefresh = null,
  poll = true, onChange = null, arrival = null }) {
  /* Everything a timer or a listener reads is held in a ref, so a parent that
     hands a new `onRefresh` on every render cannot restart the clock or
     re-read on every render. Arriving reads once — again only when `arrival`
     (the deal being shown) changes. */
  const refreshRef = useRef(onRefresh); refreshRef.current = onRefresh;
  const stateRef = useRef(state); stateRef.current = state;
  const dealsRef = useRef(deals); dealsRef.current = deals;
  const nameRef = useRef(nameOf); nameRef.current = nameOf;
  const changeRef = useRef(onChange); changeRef.current = onChange;
  const [failed, setFailed] = useState(false);
  const [ended, setEnded] = useState(false);
  const [notes, setNotes] = useState({});
  const failedNow = useRef(false);
  const busy = useRef(false);
  const fails = useRef(0);
  const timer = useRef(null);
  const alive = useRef(true);
  const stopped = useRef(false);
  const lastAt = useRef(0);

  const visible = () => { const d = env().document; return !!d && d.visibilityState === "visible"; };
  const clear = () => { if (timer.current != null) { env().clearTimeout(timer.current); timer.current = null; } };
  const setFail = (v) => { if (failedNow.current !== v) { failedNow.current = v; if (alive.current) setFailed(v); } };

  const schedule = () => {
    clear();
    if (!poll || !alive.current || stopped.current || !refreshRef.current || !visible() || !dealsRef.current.length) return;
    /* After 1, 2, 3+ failures in a row: 30, 60, 120 seconds. */
    const wait = fails.current ? BACKOFF_MS[Math.min(fails.current, BACKOFF_MS.length - 1)] : FRESH_MS;
    const t = env().setTimeout(() => { timer.current = null; check(); }, wait);
    if (t && typeof t.unref === "function") t.unref();
    timer.current = t;
  };

  const check = async () => {
    if (!refreshRef.current || busy.current || stopped.current || !alive.current) return;
    busy.current = true;
    lastAt.current = Date.now();
    const ids = [...dealsRef.current];
    const before = new Map(ids.map((id) => [id, dealPrint(stateRef.current, id, seat)]));
    try {
      const next = await refreshRef.current();
      fails.current = 0;
      setFail(false);
      if (!alive.current) return;
      const now = next && typeof next === "object" ? next : stateRef.current;
      const found = {};
      for (const id of ids) {
        const after = dealPrint(now, id, seat);
        if (!same(before.get(id), after)) found[id] = changeNote(before.get(id), after, seat, nameRef.current(id));
      }
      if (Object.keys(found).length) {
        setNotes((held) => ({ ...held, ...found }));
        for (const [id, note] of Object.entries(found)) if (changeRef.current) changeRef.current(id, note);
      }
    } catch (error) {
      fails.current += 1;
      setFail(true);
      if (error && error.failure === "unauthenticated") { stopped.current = true; if (alive.current) setEnded(true); }
    } finally {
      busy.current = false;
      schedule();
    }
  };

  const refreshNow = useCallback(() => { fails.current = 0; return check(); }, []);

  useEffect(() => {
    alive.current = true;
    if (!refreshRef.current) return undefined;
    check();                                   // arriving reads the server again
    const d = env().document;
    const w = env().window;
    /* Coming back to the page reads again at once. Focus and visibility
       arrive together, so a return from HIDDEN always checks, and a bare
       focus checks only if nothing was asked in the last second. */
    let wasHidden = false;
    const back = () => {
      if (!visible()) { wasHidden = true; clear(); return; }
      if (wasHidden || Date.now() - lastAt.current > 1000) { wasHidden = false; check(); } else schedule();
    };
    if (d && d.addEventListener) d.addEventListener("visibilitychange", back);
    if (w && w.addEventListener) w.addEventListener("focus", back);
    return () => {
      alive.current = false;
      clear();
      if (d && d.removeEventListener) d.removeEventListener("visibilitychange", back);
      if (w && w.removeEventListener) w.removeEventListener("focus", back);
    };
  }, [arrival, !!onRefresh]);

  /* A deal appearing on (or leaving) the screen starts or stops the clock. */
  useEffect(() => { if (!busy.current) schedule(); }, [deals.join(","), poll]);

  return { failed, ended, notes, refreshNow };
}
