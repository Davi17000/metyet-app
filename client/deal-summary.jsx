/* ============================================================================
   THE DEAL SUMMARY — ONE DEAL, ONE SHARED TRUTH, TWO PERSPECTIVES (M3B B4)

   One compact card, the same on both seats: the card being bought, the cards
   going toward it, and who owes whom. It is the foundation of three later uses
   — the living summary while a deal is negotiated, the reference at an
   in-person handoff, and the permanent receipt — and B4 builds only the first.
   The Collector's Deal Workspace and the Trusted Partner's Opportunity both
   render THIS component; there is no second summary and no secret view.

   IT IS A PRESENTATION, NOT A LEDGER. Every figure is read from the deal the
   server projected: the agreed price (`agreedPrice`), each card still in the
   deal with its agreed market value and percentage, and the credit and
   balance from value-trade.jsx's `creditOf` / `cashPicture` — the domain's
   own `tradeValueOf` and `calculatedBalance`, held to them by a test. Nothing
   is stored, snapshotted or sent from here.

   WHO OWES WHOM, FROM WHERE YOU SIT. One signed balance, said twice — "You
   Owe" and "You Receive" — relative to the signed-in seat. At most one is
   ever more than $0, neither is ever negative, and the two seats' figures are
   mirror images of the same number (`payments`). Only fully agreed trade-ins
   count; while any is still being valued, the summary says the amounts may
   change. It never says a payment happened: these are the agreed figures, not
   a record of money or cards changing hands.

   EVERY CARD IS IDENTIFIABLE, AND NOTHING IS MADE UP. The card's name, set,
   number (with the release's printed total when the catalogue holds one:
   "173/165") and printing come from the catalogue's description of its
   canonical card; its grade or condition from THIS physical copy's record (the
   shop's copy for the featured card, the Collector's copy for a trade-in —
   fields both seats' projections already carry). A fact the record does not
   hold is left out, never filled from another copy or a default.

   THE PICTURE IS THE CATALOGUE'S, AND SAYS SO. A copy's own `photos` are
   references the partner typed (`binder:t15:front`), not images MetYet holds
   or serves, so they are never used as a picture (`featuredImage`); the
   catalogue's artwork of the exact printing is shown, captioned, and the
   neutral plate when there is none.

   `cls` is the seat's class prefix; `seat` is the viewer's own seat.
   ========================================================================== */
import React from "react";
import CardArt from "./card-art.jsx";
import { valuedRows, creditOf, cashPicture, usd, pctText } from "./value-trade.jsx";
import { cardNumber, conditionLine } from "./printing.js";

/* The number and condition wording are the shared ones (printing.js), so the
   summary and every row naming the same card read alike. */
export { cardNumber, conditionLine };

const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const titled = (s) => String(s).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const FINISH_NAMES = { non_holo: "Normal", holofoil: "Holo", reverse_holofoil: "Reverse Holo", cosmos_holofoil: "Cosmos Holo" };
/* The catalogue's language codes, said as words; an unfamiliar one is shown
   as its code rather than guessed. */
const LANGUAGES = { en: "English", ja: "Japanese", ko: "Korean", zh: "Chinese", fr: "French", de: "German",
  it: "Italian", es: "Spanish", pt: "Portuguese", nl: "Dutch", pl: "Polish", ru: "Russian" };

/* Set and number: "151 · 173/165". */
export const setLine = (card) => (card ? [text(card.expansionName), cardNumber(card)].filter(Boolean).join(" · ") || null : null);
/* Name, then set and number: "Pikachu · 151 · #173". */
export const identityLine = (card) => (card ? [text(card.cardName), setLine(card)].filter(Boolean).join(" · ") || null : null);
/* The exact printing, each part only when the catalogue holds it. A receipt
   says the language and the print run even when they are the usual ones. */
export const printingFacts = (card) => (card ? [
  text(card.language) ? LANGUAGES[card.language] || card.language.toUpperCase() : null,
  text(card.finish) ? FINISH_NAMES[card.finish] || titled(card.finish) : null,
  text(card.printRun) && card.printRun !== "not_applicable" ? titled(card.printRun) : null,
  text(card.stamp) && card.stamp !== "none" ? `${titled(card.stamp)} stamp` : null,
  text(card.printVariation) && card.printVariation !== "standard" ? titled(card.printVariation) : null,
].filter(Boolean).join(" · ") || null : null);

/* The featured card's picture, in order of preference: a photograph of THIS
   copy, then the catalogue's artwork of its printing, then the neutral plate.
   MetYet holds no copy photographs yet — `photos` are typed references, not
   images — so the first never applies, and a reference is never used as a
   picture. Returns { src, source }. */
export function featuredImage(card) {
  const art = card && (text(card.imageSmall) || text(card.imageLarge));
  return art ? { src: art, source: "catalogue" } : { src: null, source: null };
}

/* WHO OWES WHOM, FROM `seat`. The one signed balance from `cashPicture`
   (positive: the Collector pays the shop), said as two amounts that are never
   negative and never both above $0. null for both when the price is not known
   or the seat is not one of the deal's two. */
const SEATS = new Set(["collector", "tp"]);
export function payments(picture, seat) {
  if (!picture || picture.direction === "unknown" || !SEATS.has(seat)) return { owe: null, receive: null };
  const payer = picture.direction === "collector-to-tp" ? "collector" : picture.direction === "tp-to-collector" ? "tp" : null;
  if (!payer) return { owe: 0, receive: 0 };
  return payer === seat ? { owe: picture.amount, receive: 0 } : { owe: 0, receive: picture.amount };
}

/* ONE LOOK ON BOTH SEATS. The summary's stylesheet, written once and placed by
   each shell under its own prefix from the tokens both shells define (`--panel`,
   `--line`, `--t1`, …). `margin` is where it sits in that shell's layout. A
   receipt: one column, short lines, the two amounts set apart; the featured
   picture shrinks under 380px; nothing scrolls sideways. */
/* `phoneMargin`: where it sits at phone width (≤520px), when the shell's
   own padding already frames it — so both seats give it the same width. On a
   wide screen it is centred: a receipt-width card, deliberately narrower than
   the panels around it. */
export const summaryCss = (cls, { margin = "0", phoneMargin = null } = {}) => {
  const c = `.${cls}-sum`;
  return `
${c} { margin:${margin}; max-width:560px; background:var(--panel); border:1px solid var(--line); border-radius:12px;
  padding:14px; display:flex; flex-direction:column; gap:10px; }
${c}-h { margin:0; font-family:var(--font-display, 'Archivo', system-ui, sans-serif); font-size:10.5px; font-weight:700;
  letter-spacing:.09em; text-transform:uppercase; color:var(--muted); }
${c}-status { margin:-6px 0 0; font-size:12.5px; color:var(--t1); font-weight:600; }
${c}-feat { display:flex; gap:14px; align-items:flex-start; }
${c}-fig { margin:0; flex:0 0 104px; width:104px; display:flex; flex-direction:column; gap:3px; }
${c}-art { width:104px; height:145px; border-radius:6px; overflow:hidden; background:var(--line-soft);
  display:flex; align-items:center; justify-content:center; }
${c}-art img { width:100%; height:100%; object-fit:cover; display:block; }
${c}-plate { font-size:10px; line-height:1.15; color:var(--muted); text-align:center; padding:4px; overflow-wrap:anywhere; }
${c}-cap { font-size:10.5px; color:var(--faint); text-align:center; }
${c}-fid { flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap:2px; }
${c}-name { margin:0; font-family:var(--font-display, 'Archivo', system-ui, sans-serif); font-size:19px; font-weight:700;
  line-height:1.2; color:var(--text); overflow-wrap:anywhere; }
${c}-line { margin:0; font-size:12.5px; color:var(--muted); overflow-wrap:anywhere; }
${c}-price { margin:8px 0 0; display:flex; flex-direction:column; gap:0; }
${c}-price span { font-size:11px; color:var(--faint); text-transform:uppercase; letter-spacing:.06em; }
${c}-price strong { font-size:22px; font-weight:700; color:var(--text); font-variant-numeric:tabular-nums; }
${c}-sub { margin:4px 0 0; font-size:11px; color:var(--faint); text-transform:uppercase; letter-spacing:.06em; }
${c}-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; }
${c}-item { padding:8px 0; border-top:1px solid var(--line-soft); display:flex; flex-direction:column; gap:1px; }
${c}-item:first-child { border-top:0; padding-top:2px; }
${c}-iname { margin:0; font-weight:700; font-size:13.5px; color:var(--text); overflow-wrap:anywhere; }
${c}-calc { margin:2px 0 0; display:flex; justify-content:space-between; align-items:baseline; gap:10px; flex-wrap:wrap;
  font-size:13px; color:var(--muted); font-variant-numeric:tabular-nums; }
${c}-calc strong { color:var(--text); font-size:14px; }
${c}-calc.pending strong { color:var(--amber); font-size:12.5px; }
${c}-total { margin-top:2px; padding:12px; border-radius:10px; background:var(--t1-bg); display:flex; flex-direction:column; gap:4px; }
${c}-trow { margin:0; display:flex; justify-content:space-between; align-items:baseline; gap:10px; flex-wrap:wrap;
  font-size:13px; color:var(--muted); font-variant-numeric:tabular-nums; }
${c}-pay { margin:0; display:flex; justify-content:space-between; align-items:baseline; gap:10px; flex-wrap:wrap; color:var(--muted); }
${c}-pay span { font-size:14px; font-weight:600; }
${c}-pay strong { font-size:20px; font-weight:700; font-variant-numeric:tabular-nums; }
${c}-pay.due { color:var(--t1); }
${c}-pay.due strong { font-size:24px; }
${c}-tlabel { margin:6px 0 0; font-size:11px; font-weight:700; color:var(--amber); text-transform:uppercase; letter-spacing:.06em; }
${c}-tnote { margin:0 0 2px; font-size:12.5px; color:var(--text); line-height:1.4; }
${c}-total.pending { background:var(--amber-bg); border:1px solid var(--amber-line); }
${c}-total.pending ${c}-pay, ${c}-total.pending ${c}-pay.due { color:var(--text); }
${c}-total.pending ${c}-pay span { font-weight:500; }
${c}-total.pending ${c}-pay strong, ${c}-total.pending ${c}-pay.due strong { font-size:17px; font-weight:600; }
@media (min-width:700px) { ${c} { margin-left:auto; margin-right:auto; width:100%; } }
${phoneMargin ? `@media (max-width:520px) { ${c} { margin:${phoneMargin}; } }` : ""}
@media (max-width:380px) { ${c}-fig { flex-basis:84px; width:84px; } ${c}-art { width:84px; height:117px; } }
`;
};

/* `featured` — { card, copy }: the catalogue description of the deal's card
   and the shop's copy of it. `named` — catalogue descriptions by canonical
   id; `copies` — the trade-in copies by id, when the viewer can see them. */
export function DealSummary({ cls, deal, seat, featured = {}, named = {}, copies = new Map() }) {
  if (!deal) return null;
  const card = featured.card || null;
  const copy = featured.copy || null;
  const picture = cashPicture(deal);
  const live = valuedRows(deal);
  const pay = payments(picture, seat);
  const image = featuredImage(card);
  const c = (x) => `${cls}-sum-${x}`;
  const status = !live.length ? "No trade-ins in this deal"
    : !picture.pendingCount ? "Every trade-in value is agreed"
      : `Valuing trade-ins · ${picture.agreedCount} of ${live.length} agreed`;
  const amount = (n) => (n == null ? "—" : usd(n));
  return (
    <section className={`${cls}-sum`} aria-label="Deal summary" data-summary={deal.id}>
      <h2 className={c("h")}>Deal summary</h2>
      <p className={c("status")}>{status}</p>
      <div className={c("feat")}>
        <figure className={c("fig")}>
          <CardArt src={image.src} name={card && card.cardName} wrap={c("art")} plate={c("plate")} decorative />
          {image.source === "catalogue" ? <figcaption className={c("cap")}>Catalogue image</figcaption> : null}
        </figure>
        <div className={c("fid")}>
          <p className={c("name")}>{(card && text(card.cardName)) || "A card MetYet is still describing"}</p>
          {setLine(card) ? <p className={c("line")}>{setLine(card)}</p> : null}
          {printingFacts(card) ? <p className={c("line")}>{printingFacts(card)}</p> : null}
          {conditionLine(copy) ? <p className={c("line")}>{conditionLine(copy)}</p> : null}
          <p className={c("price")}><span>Agreed price</span><strong>{usd(deal.agreedPrice) || "Not agreed yet"}</strong></p>
        </div>
      </div>

      {live.length ? (
        <>
          <p className={c("sub")}>{live.length === 1 ? "Trade-in" : `Trade-ins · ${live.length}`}</p>
          <ul className={c("list")} aria-label="Trade-ins">
            {live.map((r) => {
              const tc = named[r.canonicalCardId] || null;
              const own = copies.get(r.binderId) || r;
              const credit = creditOf(r);
              return (
                <li key={r.id} className={c("item")} data-row={r.id}>
                  <p className={c("iname")}>{identityLine(tc) || "A card MetYet is still describing"}</p>
                  <p className={c("line")}>{[printingFacts(tc), conditionLine(own)].filter(Boolean).join(" · ") || null}</p>
                  {credit != null ? (
                    <p className={c("calc")}>
                      <span>{`${usd(r.agreedMarket)} × ${pctText(r.agreedPercent)} =`}</span>
                      <strong>{`−${usd(credit)}`}</strong>
                    </p>
                  ) : (
                    <p className={`${c("calc")} pending`}>
                      <span>{r.agreedMarket != null ? `${usd(r.agreedMarket)} agreed · % not agreed yet` : "Market value not agreed yet"}</span>
                      <strong>Not valued yet</strong>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {/* WHILE ANY TRADE-IN IS STILL BEING VALUED the two amounts are today's,
          said as such before they are read, and drawn quieter than agreed
          ones (M3B B4 polish). Once every value is agreed, the label and the
          note go and the amount due takes its full weight. */}
      <div className={`${c("total")}${picture.pendingCount ? " pending" : ""}`} role="status" aria-label="Who owes whom">
        {live.length ? (
          <p className={c("trow")}><span>Agreed trade-in value</span><span>{usd(picture.credit)}</span></p>
        ) : null}
        {picture.pendingCount ? (
          <>
            <p className={c("tlabel")}>Current amounts</p>
            <p className={c("tnote")}>These amounts may change until all trade-in values are agreed.</p>
          </>
        ) : null}
        <p className={`${c("pay")}${pay.owe ? " due" : ""}`} data-pay="owe"><span>You Owe</span><strong>{amount(pay.owe)}</strong></p>
        <p className={`${c("pay")}${pay.receive ? " due" : ""}`} data-pay="receive"><span>You Receive</span><strong>{amount(pay.receive)}</strong></p>
      </div>
    </section>
  );
}
