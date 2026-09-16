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
   ========================================================================== */

import React from "react";
import { Panel, Record, Fact, Tag } from "../parts.jsx";
import { rows, text, day, plural, byRecency } from "../present.js";

export default function TrustedPartners({ state }) {
  const partners = rows(state && state.partners);
  /* The relationship whose row names THIS partner. */
  const relationshipOf = new Map();
  for (const r of rows(state && state.relationships)) {
    if (r.partnerId != null) relationshipOf.set(r.partnerId, r);
  }

  /* Longest-standing first, when the server said when it started. */
  const ordered = byRecency(
    partners.map((p) => ({ ...p, __at: (relationshipOf.get(p.id) || {}).at })), "__at",
  ).reverse();

  return (
    <Panel
      title="Your Trusted Partners"
      note={partners.length ? plural(partners.length, "shop", "shops") : null}
      empty={partners.length ? null
        : "You have no Trusted Partners yet. A shop invites you, and the relationship starts "
          + "when you accept — they can then see your goals and your Trade Binder."}
    >
      {ordered.map((p) => {
        const rel = relationshipOf.get(p.id) || null;
        const specialties = rows(p.specialties).map(text).filter(Boolean);
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
          </Record>
        );
      })}
    </Panel>
  );
}
