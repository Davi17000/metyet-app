/* ============================================================================
   THE FOUR COLLECTING STATES — ONE VISUAL LANGUAGE (P6-F4 Batch 2A)

   The founder-approved mapping, defined once and used everywhere a Collector
   sees one of the four states: Binder tiles and their card sheet, Browse's
   saved-card markers, and the Phase 6 card's tier / disposition choices.

     state         colour     icon                          message
     Primary       #21865A    square focus reticle          Actively hunting
     Secondary     #3C75CA    eye                           Interested
     PC            #8655B9    gem                           A keeper
     Trade / Sell  #CB792E    exchange arrows               Available for trade or sale

   `color` is the founder's colour, used for the icon and the outline. `ink` is
   the same hue, darkened only as far as a small label needs to read at 4.6:1
   or better on its own tint (`tint`, 10% of the colour): the founder's orange
   is 3.3:1 on white, so a label in it would fail. The label is always shown —
   a state is never told by colour alone.

   ONLY THESE FOUR. A copy that has said neither (Owned), a Goal without a
   tier, an earlier filing, a TP's inventory status or a deal stage is not one
   of them and never wears this language.
   ========================================================================== */
import React from "react";

export const STATE_STYLE = Object.freeze({
  primary: Object.freeze({ label: "Primary", color: "#21865A", tint: "#E9F3EF", ink: "#1E7B53", message: "Actively hunting" }),
  secondary: Object.freeze({ label: "Secondary", color: "#3C75CA", tint: "#ECF1FA", ink: "#376CBA", message: "Interested" }),
  pc: Object.freeze({ label: "PC", color: "#8655B9", tint: "#F3EEF8", ink: "#8152B2", message: "A keeper" }),
  trade: Object.freeze({ label: "Trade / Sell", color: "#CB792E", tint: "#FAF2EA", ink: "#9A5C23", message: "Available for trade or sale" }),
});
export const isCollectingState = (s) => Object.prototype.hasOwnProperty.call(STATE_STYLE, s);

/* THE ICONS, inline (no library, no asset). 16-unit grid, stroked in the
   state's colour, rounded ends. `bold` thickens the stroke for chip sizes. */
const PATHS = {
  /* PRIMARY — a SQUARE focus reticle, never a circular target: four open
     square corners, four short centre crosshair strokes, a small centre dot. */
  primary: (
    <>
      <path d="M2 5.5V2h3.5" /><path d="M10.5 2H14v3.5" /><path d="M14 10.5V14h-3.5" /><path d="M5.5 14H2v-3.5" />
      <path d="M8 4.25v2" /><path d="M8 9.75v2" /><path d="M4.25 8h2" /><path d="M9.75 8h2" />
      <rect x="7.2" y="7.2" width="1.6" height="1.6" rx="0.8" fill="currentColor" stroke="none" data-part="dot" />
    </>
  ),
  /* SECONDARY — an eye */
  secondary: (
    <>
      <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
  /* PC — a gem */
  pc: (
    <>
      <path d="M4.5 2.5h7l3 3.5L8 13.5 1.5 6z" /><path d="M1.5 6h13" /><path d="M6.25 2.5 5 6l3 7.5 3-7.5-1.25-3.5" />
    </>
  ),
  /* TRADE / SELL — horizontal exchange arrows */
  trade: (
    <>
      <path d="M2.5 5.5h10" /><path d="M10 3l2.5 2.5L10 8" /><path d="M13.5 10.5h-10" /><path d="M6 8l-2.5 2.5L6 13" />
    </>
  ),
};

export function StateIcon({ kind, size = 12, bold = false, className = "" }) {
  if (!isCollectingState(kind)) return null;
  return (
    <svg className={`mcs-sticon${className ? ` ${className}` : ""}`} data-state-icon={kind} width={size} height={size}
      viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={bold ? 2 : 1.6} strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[kind]}
    </svg>
  );
}

/* A state chip: icon + label, tinted. Anything that is not one of the four
   renders as the neutral chip it always was (no icon, no colour). */
export function StateChip({ kind, label = null, className = "mcs-mk" }) {
  const s = STATE_STYLE[kind];
  const text = label || (s ? s.label : "");
  return (
    <span className={`${className} mcs-mk-${kind}${s ? " mcs-st" : ""}`} data-collecting={s ? kind : undefined}>
      {s ? <StateIcon kind={kind} size={10} bold /> : null}{text}
    </span>
  );
}

/* THE ONE STYLESHEET for the four states — every place that shows them reads
   these variables; nothing else in the app spells these colours. */
export const STATE_CSS = Object.entries(STATE_STYLE).map(([k, s]) =>
  `.mcs-st-${k}, .mcs-mk-${k}.mcs-st, [data-st="${k}"] { --st:${s.color}; --st-tint:${s.tint}; --st-ink:${s.ink}; }`).join("\n");
