/* ============================================================================
   CARD DETAIL — THE PHASE 6 CARD, FROM BROWSE (P6-F3A Stage 1)

   A port of the frozen prototype's `CardDetail` (phase6-prototype-01 @ fca2c61,
   prototypes/phase6-01-browse-add/main.jsx L432–611; styles index.html L31–36,
   78–106, 168–173, 189), on production data:

     header      "‹ <where you came from>" · the quiet ‹ › stepper through the
                 Browse results · once the picture scrolls away, a small copy
                 of the card rides in the header (prototype: scrollTop > 300)
     hero        the card's picture at 72% width — the chosen version's when
                 one is chosen, else the card's
     identity    name; set · number · artist
     remembers   what this Collector already wants or owns of this card, from
                 their own projection (prototype: "MetYet remembers")
     versions    "Which version?" over the printings MetYet can record; one
                 printing is said, not asked; none is "MetYet can't record
                 this card yet."
     dock        "Add to MetYet", pinned

   STAGE 1 IS PRESENTATION ONLY. The prototype's guided questions ("What does
   this card mean to you?", raw or graded, how important) are Stage 2 and are
   not drawn here. Until then "Add to MetYet" opens MetYet's CURRENT card form
   (the Card Specification) for the chosen version — the existing, tested
   save path — and the dock says so. Nothing on this screen writes.

   A card picture is only what the catalogue holds for a printing (C7.1): this
   file names no provider, builds no URL, and draws through CardArt.
   ========================================================================== */
import React, { useEffect, useRef, useState } from "react";
import CardArt from "../card-art.jsx";
import { rows, text, gradeLine, criteriaLine } from "./present.js";

/* The prototype's version words (fixtures.js FINISH_NAMES), plus what else
   makes a production printing different, said only when it is not the usual. */
const FINISH_NAMES = { non_holo: "Normal", holofoil: "Holo", reverse_holofoil: "Reverse Holo", cosmos_holofoil: "Cosmos Holo" };
const titled = (s) => String(s).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
export const versionLabel = (card) => [
  FINISH_NAMES[card.finish] || titled(card.finish || "Version"),
  card.printRun && !["unlimited", "not_applicable"].includes(card.printRun) ? titled(card.printRun) : null,
  card.stamp && card.stamp !== "none" ? `${titled(card.stamp)} stamp` : null,
  card.printVariation && card.printVariation !== "standard" ? titled(card.printVariation) : null,
  card.language && card.language !== "en" ? card.language.toUpperCase() : null,
].filter(Boolean).join(" · ");
const TIER = { primary: "Primary", secondary: "Secondary" };

/* "MetYet remembers" (prototype Remembered): per version, the Goal and the
   copies this Collector already has, with where each lives. */
function remembered(state, cards) {
  const binders = rows(state && state.binders);
  const memberships = rows(state && state.binderMemberships);
  /* A binder is told apart by its id, never by its name: two binders may share one. */
  const binderOf = (key, id) => {
    const m = memberships.find((x) => x[key] === id);
    return (m && binders.find((x) => x.id === m.binderId)) || null;
  };
  const lines = [];
  for (const card of cards) {
    const label = versionLabel(card);
    const goal = rows(state && state.goals).find((g) => g.canonicalCardId === card.canonicalCardId);
    if (goal) {
      const home = binderOf("goalId", goal.id);
      lines.push([label, "Looking for it", TIER[goal.tier] || null, criteriaLine(goal.desired) || null, home ? text(home.name) : null]
        .filter(Boolean).join(" · "));
    }
    /* Copies alike in every shown fact and in the same binder are one line, "2 copies". */
    const groups = [];
    for (const c of rows(state && state.collectorCopies).filter((x) => x.canonicalCardId === card.canonicalCardId)) {
      const what = c.offered === true ? "Trade / Sell" : c.keeping === true ? "Personal collection" : "Owned";
      const facts = gradeLine(c); const home = binderOf("collectorCopyId", c.id);
      const g = groups.find((x) => x.what === what && x.facts === facts && x.binderId === (home && home.id));
      if (g) g.n += 1; else groups.push({ what, facts, binderId: home && home.id, home: home ? text(home.name) : null, n: 1 });
    }
    for (const g of groups) {
      lines.push([label, g.n > 1 ? `${g.n} copies` : "You own it", g.what, g.facts || null, g.home].filter(Boolean).join(" · "));
    }
  }
  return lines;
}

export default function CardDetail({ context, state, backLabel = "Browse", position = 0, total = 1,
  onStep = null, onClose, onAdd = null }) {
  const cards = rows(context && context.cards);
  /* One printing is not a choice; several are asked (prototype blankAnswers). */
  const [chosenId, setChosenId] = useState(cards.length === 1 ? cards[0].canonicalCardId : null);
  const chosen = cards.find((c) => c.canonicalCardId === chosenId) || null;
  const [compact, setCompact] = useState(false);
  const scroller = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("keydown", onKey);
    return () => { if (typeof window !== "undefined" && window.removeEventListener) window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  /* The picture: the chosen version's, else the card's. A version whose
     picture is the same as another version's is the CARD's picture, and says
     so (prototype: "Card picture — this version may look different."). */
  const pictureOf = (c) => (c ? c.imageLarge || c.imageSmall || null : null);
  const cardPicture = (context && (context.imageLarge || context.imageSmall)) || pictureOf(cards.find(pictureOf)) || null;
  const imageShown = (chosen && pictureOf(chosen)) || cardPicture;
  const shared = chosen && cards.length > 1 && (!pictureOf(chosen)
    || cards.some((c) => c !== chosen && pictureOf(c) === pictureOf(chosen)));
  const name = text(context && context.cardName) || "This card";
  const number = text(context && context.collectorNumber);
  const ident = [text(context && context.expansionName), number, text(context && context.artist)].filter(Boolean).join(" · ");
  const lines = remembered(state, cards);
  /* THE FINISH, SHOWN ON THE CARD'S OWN PICTURE (prototype CardArt `fx`): a
     holo or reverse-holo version whose picture is the card's, not its own,
     wears the prototype's sheen so the version still reads at a glance. */
  const fx = !chosen || !shared ? "" : chosen.finish === "reverse_holofoil" ? " rev"
    : chosen.finish === "holofoil" || chosen.finish === "cosmos_holofoil" ? " holo" : "";
  const art = (size) => (
    <CardArt src={imageShown} name={name} wrap={`mcs-cd-art ${size}`} plate="mcs-art-plate" decorative
      card={{ key: context && context.cardContextId, set: context && context.expansionName, number }} />
  );

  return (
    <div className="mcs-cd" role="dialog" aria-modal="true" aria-label={`${name}${ident ? `, ${ident}` : ""}`}>
      <header className="mcs-cd-hd">
        <button type="button" className="mcs-cd-back" onClick={onClose}>‹ {backLabel}</button>
        {compact ? (
          <span className="mcs-cd-mini">{art("mini")}<b>{name}</b><span>{chosen ? versionLabel(chosen) : number ? `#${number}` : ""}</span></span>
        ) : null}
        {/* ONE CARD IS THE SUBJECT (prototype): no "3 of 9"; the arrows stay, quiet. */}
        <span className="mcs-cd-step">
          <button type="button" aria-label="Previous card" disabled={!onStep || position <= 0} onClick={() => onStep(-1)}>‹</button>
          <button type="button" aria-label="Next card" disabled={!onStep || position >= total - 1} onClick={() => onStep(1)}>›</button>
        </span>
      </header>
      <div className="mcs-cd-scroll" ref={scroller} onScroll={(e) => setCompact(e.currentTarget.scrollTop > 300)}>
        <div className="mcs-cd-hero">
          <span className={`mcs-cd-frame${fx}`}>{art("hero")}{fx ? <span className="mcs-cd-sheen" aria-hidden="true" /> : null}</span>
        </div>
        {shared ? <p className="mcs-cd-imgnote">Card picture — this version may look different.</p> : null}
        <div className="mcs-cd-ident">
          <h2>{name}</h2>
          {ident ? <p>{ident}</p> : null}
        </div>
        {lines.length ? (
          <div className="mcs-cd-remembered">
            <h4>MetYet remembers</h4>
            <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        ) : null}
        {!cards.length ? (
          <section className="mcs-cd-q">
            <h3>Which version?</h3>
            <p className="mcs-cd-cannot">MetYet can&apos;t record this card yet.</p>
          </section>
        ) : cards.length > 1 ? (
          <section className="mcs-cd-q">
            <h3>Which version?</h3>
            <div className="mcs-cd-wrap" role="group" aria-label="Which version?">
              {cards.map((c) => (
                <button key={c.canonicalCardId} type="button" className={`mcs-cd-choice${chosenId === c.canonicalCardId ? " on" : ""}`}
                  aria-pressed={chosenId === c.canonicalCardId} onClick={() => setChosenId(c.canonicalCardId)}>
                  <b>{versionLabel(c)}</b>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <p className="mcs-cd-established">{versionLabel(cards[0])} — the only version of this card.</p>
        )}
        <div className="mcs-cd-spacer" />
      </div>
      <div className="mcs-cd-dock">
        {/* STAGE 1: said, not hidden. */}
        {chosen && onAdd ? <p className="mcs-cd-hint quiet">For now, Add opens MetYet&apos;s current card form.</p> : null}
        <button type="button" className={`mcs-cd-add${chosen && onAdd ? " ready" : ""}`} aria-disabled={!(chosen && onAdd)}
          onClick={() => { if (chosen && onAdd) onAdd(chosen); }}>Add to MetYet</button>
      </div>
    </div>
  );
}
