/* ============================================================================
   THE CARD'S PICTURE, AND WHAT STANDS THERE WHEN THERE ISN'T ONE (Phase 5 C7.1)

   Four surfaces in the deployed client draw a card's artwork, and before this
   file each of them wrote the same two lines: if there is a URL, an `<img>`;
   otherwise something, or in three of the four, nothing at all. That left two
   holes, and the second is the one that matters.

   THE FIRST HOLE: AN EMPTY TILE. Browse drew the card's name when it had no
   picture; My Cards, Trusted Partners and the Binder drew an empty box, on the
   reasoning that the title sits an inch away so a name in the tile repeats it.
   That is a fair argument and it is the weaker one: an empty tile cannot be told
   apart from one still loading or one whose picture broke, and the person
   deciding whether a shop has THEIR card is exactly the person who should not
   be left reading an ambiguity.

   THE SECOND HOLE: A URL THAT FAILS. Every one of the four guarded against the
   ABSENCE of a URL and none against a URL that does not load — so a card whose
   picture stopped answering fell back to nothing at all. That is not
   hypothetical: a catalogue image URL points at somebody else's host, MetYet
   does not control whether it answers, and a URL that worked at import time can
   stop working afterwards without anything in MetYet changing.

   WHAT IT WILL NOT SAY. Only a name MetYet actually holds. A caller that has
   not loaded the card yet has no name to give, and this draws the empty box
   rather than a status line or the word "card" — because a tile that says
   "Loading this card…" beside a title that already says "Loading this card…"
   has told the reader nothing and taken up the room where the answer goes. An
   empty tile for a card MetYet cannot yet name is honest; a filled one is not.

   WHY THE FAILURE IS FORGOTTEN WHEN THE URL CHANGES, AND WHY IT IS NOT AN
   EFFECT. `failed` is presentation state — what this browser just observed
   about one request — and it is never written down anywhere. React reuses a
   component instance as a list re-renders or re-sorts, so without a reset an
   error remembered from the PREVIOUS card would blank the picture of a
   perfectly good NEXT one. Doing that reset in `useEffect` would be a frame too
   late: an effect runs after the commit, so there is a real painted frame
   showing the fallback for a picture that is fine, and a span→img churn on
   every re-sort. So the state is adjusted DURING the render that notices the
   URL changed, which is React's own documented pattern for exactly this and
   produces no intermediate commit.

   WHAT THIS FILE DOES NOT DO. It does not fetch anything, construct a URL, name
   a provider, or guess a picture for a card that has none. It is handed a URL
   or it is not.
   ============================================================================ */

import React, { useState } from "react";

const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

/* `wrap` and `plate` are the caller's class names on purpose: the four tiles
   are four sizes — a grid cell, a 52px row tile, a 34px list tile — and one
   class cannot be tuned for all of them. What is shared here is the BEHAVIOUR,
   which is the part that was inconsistent.

   `decorative` is for the three surfaces where the card's name is rendered as
   text immediately beside the tile. There the plate is a second copy of a
   thing already announced, so it is hidden from assistive tech rather than
   read out twice. Browse leaves it false, because in a grid of pictures the
   plate IS the identification and nothing else names the card. */
/* THE PHASE 6 PLACEHOLDER (P6-F1), ported from the frozen prototype's own
   no-picture card (fca2c61, main.jsx CardArt; index.html .art): card-shaped,
   coloured, with the card's name across the top, a simple drawn figure in the
   window, its set and number along the foot, and "No picture yet". It is a
   DRAWING, not artwork — no image, URL or provider — so it needs no image
   rights. A caller opts in by passing `card` ({ key, set, number }); the
   colour and pose come from `key`, the same 31-hash the prototype uses, so a
   card always looks the same. Anything MetYet does not know is left blank
   rather than guessed. */
const hash = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
function Placeholder({ wrap, label, card, decorative }) {
  const h = hash(card.key || label || "");
  const a11y = decorative ? { "aria-hidden": "true" } : label ? { role: "img", "aria-label": label } : {};
  return (
    <span className={`${wrap} mcs-ph`} style={{ "--h": h % 360, "--h2": (h >> 9) % 360 }} {...a11y}>
      <span className="mcs-ph-top"><b>{label || ""}</b><span aria-hidden="true">◆</span></span>
      <span className="mcs-ph-window">
        <svg viewBox="0 0 100 70" className={`mcs-ph-pose p${h % 5}`} aria-hidden="true" focusable="false">
          <ellipse cx="50" cy="60" rx="34" ry="5" className="shadow" />
          <path className="body" d="M22 50 C20 30 40 18 55 22 C70 26 80 38 76 50 C72 60 30 62 22 50Z" />
          <path className="fin" d="M50 22 C46 8 60 4 66 12 C60 14 56 18 55 22Z" />
          <circle className="eye" cx="62" cy="36" r="3.4" />
          <path className="cheek" d="M30 40 l-9 -4 l2 8 l-9 1 l9 4Z" />
        </svg>
      </span>
      <span className="mcs-ph-foot"><span>{text(card.set) || ""}</span><span>{text(card.number) || ""}</span></span>
      <span className="mcs-ph-none">No picture yet</span>
    </span>
  );
}

export default function CardArt({ src = null, name = "", wrap, plate, decorative = false, card = null }) {
  const url = text(src);
  const label = text(name);

  const [failed, setFailed] = useState(false);
  const [tried, setTried] = useState(url);
  if (tried !== url) { setTried(url); setFailed(false); }

  if (url && !failed) {
    return (
      <span className={wrap}>
        {/* alt is empty because the name is the plate's job and, where there is
            a picture, the title beside it: an alt that repeats the title makes
            a screen reader say the card twice. */}
        <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
      </span>
    );
  }

  /* No picture, or one that would not load. The wrapper is drawn either way —
     it carries the tile's shape, so nothing on the row moves. */
  if (card) return <Placeholder wrap={wrap} label={label} card={card} decorative={decorative} />;
  return (
    <span className={wrap}>
      {label
        ? (decorative
          ? <span className={plate} aria-hidden="true">{label}</span>
          : <span className={plate} role="img" aria-label={label}>{label}</span>)
        : null}
    </span>
  );
}
