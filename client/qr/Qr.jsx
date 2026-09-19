/* ============================================================================
   A QR CODE ON SCREEN, AND NOTHING ELSE ON THE WIRE

     <Qr value="https://app.metyet.io/join#…" size={228} label="…" />

   Renders the symbol `encodeQr` computes, as inline SVG, in the browser that
   already holds the value. There is no image URL, no canvas export, no
   download and no request: a QR code is a picture of a secret, and the moment
   one is fetched from anywhere the secret has been handed to whoever answered.

   THE QUIET ZONE IS PART OF THE CODE, not decoration. The standard requires
   four light modules on every side, and a phone camera reading a laptop screen
   across a counter is exactly the case where leaving it out stops working.

   IT KNOWS NOTHING. No store, no session, no fetch, no storage, no URL. It is
   handed a string and returns a picture of it, so the only way a credential
   reaches this component is the one-time reply that already carried it.
   ========================================================================== */

import React, { useMemo } from "react";
import { encodeQr } from "./encode.js";

/* Four light modules on each side, as the specification requires. */
const QUIET = 4;

export default function Qr({ value, size = 228, label = "Invitation QR code" }) {
  /* Recomputed only when the value changes — and the value changes once, when a
     new invitation is issued. */
  const symbol = useMemo(() => {
    if (typeof value !== "string" || !value) return null;
    try {
      return encodeQr(value);
    } catch (error) {
      /* A value this encoder cannot carry is not a reason to break the panel:
         the link and the code beside it still work. */
      return null;
    }
  }, [value]);

  if (!symbol) return null;

  const span = symbol.size + QUIET * 2;
  /* One path for the whole symbol: a square per dark module. Hundreds of
     separate elements would be the same picture and a much heavier page. */
  let d = "";
  for (let y = 0; y < symbol.size; y += 1) {
    for (let x = 0; x < symbol.size; x += 1) {
      if (symbol.modules[y][x]) d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`;
    }
  }

  return (
    <svg className="tps-qr" width={size} height={size} viewBox={`0 0 ${span} ${span}`}
      role="img" aria-label={label} shapeRendering="crispEdges">
      {/* The quiet zone is drawn rather than assumed, so the symbol survives
          being placed on a coloured panel. */}
      <rect width={span} height={span} fill="#FFFFFF" />
      <path d={d} fill="#000000" />
    </svg>
  );
}
