/* ============================================================================
   TRUSTED PARTNERS — THE SHOPS YOU DEAL WITH

   A relationship network, not a marketplace. Every partner here is one the
   server put in `partners`, which it filled by walking this Collector's own
   accepted Relationships. There is no directory, no search and no browse: a
   shop you are not related to does not appear, because the server never sent
   them.

   WHAT IS SHOWN, AND WHY EACH IS ALLOWED. `PARTNER_FOR_COLLECTOR` is the
   profile a related Collector may see — name, city, what they are about, what
   they specialise in, and how to reach them. The relationship's own status and
   start date come from `relationships`, joined by explicit `partnerId`.

   WHAT IS NOT HERE, AND CANNOT BE. The partner's `tradeRate` is private
   configuration and the projection strips it. So are their acquisition costs,
   their private notes about you, when they last contacted you and when they
   last reviewed your binder — `RELATIONSHIP_PARTNER_PRIVATE` never leaves the
   server for a Collector. This file does not read any of those field names
   either, so the screen is a second line rather than the only one.

   AND NO STOCK. A partner's inventory does arrive in the projection — their
   supply, scoped by the server to partners you are related to — and nothing
   here renders it. Showing "what this shop has" is a discovery surface, which
   is a marketplace shape and a product decision nobody has made. Their goals
   find them; they do not browse a catalogue of shops.

   ---------------------------------------------------------------------------
   SUPERSEDED IN PART, AND RESTATED (Phase 5 C3.5)

   WHAT THE PARAGRAPH ABOVE PROTECTED: that a Collector never browses a shop's
   stock. MetYet is a relationship network, and a screen listing everything a
   shop has would be a marketplace wearing a relationship's clothes.

   WHY IT IS NO LONGER CORRECT AS WRITTEN: it drew the line at "inventory" when
   the thing that actually matters is WHOSE QUESTION IS BEING ANSWERED. C3.4
   removed the Goals tab — rightly, because a Goal is priority and belongs where
   the card is — and took with it the only screen that read `discoveries`. So a
   Collector could say "I am looking for this", their partner could see it, and
   the Collector was told nothing back. The product asked for effort and
   answered with silence.

   WHAT REPLACES IT, AND WHY IT IS NARROWER RATHER THAN WIDER: this screen shows
   a partner's cards ONLY where that partner's supply meets a Goal the Collector
   themselves stated. Not the shop's catalogue, not what is new, not what is
   like what you like — the cards you already said you wanted, under the shop
   that has one. Nothing is searched across shops, nothing is inferred from
   browsing or from what is in a binder, and nothing is scored. The server
   already decided the overlap and already scoped it to accepted relationships;
   this file reads `discoveries` and names the partner.

   It stays read-only. There is no Ask, no Message, no offer and no disabled
   button pretending to be one — the same discipline the partner's own
   Opportunities screen keeps. Knowing is the whole feature.
   ========================================================================== */

import React, { useEffect, useMemo, useState } from "react";
import { Panel, Record, Fact, Tag } from "../parts.jsx";
import CardArt from "../../card-art.jsx";
import { rows, text, day, plural, byRecency, groupBy, tierIntent, tierLabel,
  hasWantedLine } from "../present.js";

export default function TrustedPartners({ state, onBrowseCards = null }) {
  const partners = rows(state && state.partners);
  /* The relationship whose row names THIS partner. */
  const relationshipOf = new Map();
  for (const r of rows(state && state.relationships)) {
    if (r.partnerId != null) relationshipOf.set(r.partnerId, r);
  }

  /* WHAT THEY HAVE THAT YOU ASKED FOR (Phase 5 C3.5). A discovery row carries
     the `partnerId` it is about, so it lands under that partner and under no
     other one — the same join Goals made by `goalId`, read from the other end.
     Nothing here compares cards and nothing here decides whether the overlap is
     real: the server did that, from this Collector's own goals, their partners'
     available copies, and the relationships between them. */
  const foundByPartner = groupBy(state && state.discoveries, "partnerId");

  /* Longest-standing first, when the server said when it started. */
  const ordered = byRecency(
    partners.map((p) => ({ ...p, __at: (relationshipOf.get(p.id) || {}).at })), "__at",
  ).reverse();

  /* ONE REQUEST FOR THE IDS ON SCREEN, the way every canonical surface has
     asked since Batch 7: never one per row, never the legacy catalogue, and
     never a copy of the catalogue's facts into a discovery, a goal or a
     relationship. A card whose description has not arrived still renders — the
     partner still has it. */
  const shownKey = rows(state && state.discoveries)
    .map((d) => d.canonicalCardId).filter(Boolean).join(",");
  const shownIds = useMemo(() => [...new Set(shownKey.split(",").filter(Boolean))],
    [shownKey]);
  const [described, setDescribed] = useState({});
  useEffect(() => {
    if (!onBrowseCards || !shownIds.length) return undefined;
    let current = true;
    (async () => {
      try {
        const answer = await onBrowseCards.describe(shownIds);
        if (!current) return;
        const next = {};
        for (const card of rows(answer && answer.cards)) next[card.canonicalCardId] = card;
        setDescribed((held) => ({ ...held, ...next }));
      } catch (error) { /* a shop without captions is still your shop */ }
    })();
    return () => { current = false; };
  }, [shownKey, onBrowseCards]);

  return (
    <Panel
      title="Your Trusted Partners"
      note={partners.length ? plural(partners.length, "shop", "shops") : null}
      empty={partners.length ? null
        /* "Trade Binder" was the prototype's name for a Collector's tradeable
           cards and C2 renamed it to Your Cards, because owning and offering
           had stopped being one fact. This sentence kept the old name and was
           telling people about a thing the product no longer has. */
        : "You have no Trusted Partners yet. A shop invites you, and the relationship starts "
          + "when you accept — they can then see what you're looking for and the cards "
          + "you're offering."}
    >
      {ordered.map((p) => {
        const rel = relationshipOf.get(p.id) || null;
        const specialties = rows(p.specialties).map(text).filter(Boolean);
        const wanted = foundByPartner.get(p.id) || [];
        return (
          <Record
            key={p.id}
            title={text(p.name) || "A Trusted Partner"}
            subtitle={text(p.city)}
            tags={rel && text(rel.status) ? <Tag>{text(rel.status)}</Tag> : null}
            note={text(p.about)}
            facts={
              <>
                <Fact label="Partners since" value={day(rel && rel.at)} />
                <Fact label="Email" value={text(p.email)} />
                <Fact label="Phone" value={text(p.phone)} />
                <Fact label="Website" value={text(p.website)} />
                <Fact label="Instagram" value={text(p.instagram)} />
              </>
            }
          >
            {specialties.length ? (
              <div className="mcs-marks">
                {specialties.map((s) => <span key={s} className="mcs-mark">{s}</span>)}
              </div>
            ) : null}
            {/* THE ANSWER (Phase 5 C3.5). Said once, with the shop's name in it,
                and then the cards — so the sentence is about the relationship
                and the rows are about the cards. A partner with nothing of
                yours says nothing at all rather than "0 cards": a shop you
                trust is not failing you by not having your Charizard. */}
            {wanted.length ? (
              <>
                <p className="mcs-has-line">{hasWantedLine(p.name, wanted.length)}</p>
                <ul className="mcs-sub mcs-has">
                  {wanted.map((d) => (
                    <WantedCard key={d.key} found={d} known={described[d.canonicalCardId]} />
                  ))}
                </ul>
              </>
            ) : null}
          </Record>
        );
      })}
    </Panel>
  );
}

/* ONE CARD THIS SHOP HAS AND YOU ASKED FOR. Its picture, its name, its set and
   number, and how hard you said you were looking — and nothing else.

   DELIBERATELY ABSENT: the price, the grade of their copy, how many they hold,
   and the copy's id. A price and a grade belong to a conversation nobody has
   started, a count here would read as stock, and `invId` is the server's
   internal handle on one physical copy — printing it would turn a private
   identifier into a thing a person learns to quote. What this row promises is
   exactly what the sentence above it says: they have it. */
function WantedCard({ found, known }) {
  const title = (known && known.cardName)
    || (found.canonicalCardId ? "Loading this card…" : "A card");
  const sub = known
    ? [text(known.expansionName), known.collectorNumber ? `#${known.collectorNumber}` : null]
      .filter(Boolean).join(" · ") || null
    : null;
  return (
    <li>
      <CardArt src={known && known.imageSmall} name={known && known.cardName}
        wrap="mcs-has-art" plate="mcs-art-plate" decorative />
      <span className="mcs-sub-t">{title}</span>
      {sub ? <span className="mcs-sub-s">{sub}</span> : null}
      {found.tier ? (
        <Tag tone={found.tier === "primary" ? "strong" : null}>
          {tierIntent(found.tier) || tierLabel(found.tier)}
        </Tag>
      ) : null}
    </li>
  );
}
