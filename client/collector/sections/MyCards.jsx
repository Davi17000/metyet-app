/* ============================================================================
   YOUR CARDS — WHAT YOU OWN, AND WHAT YOU ARE OFFERING

   THIS WAS CALLED THE TRADE BINDER AND IT WAS NEVER A BINDER (Phase 5 C2). It
   is the Collector's own cards — the mirror image of a Trusted Partner's
   Inventory, owned by the other seat. The word "Binder" now belongs to the
   named grouping a Collector makes for themselves, which does not exist yet.

   OWNING AND OFFERING ARE TWO DIFFERENT FACTS, and this screen shows both.
   Every row is one physical copy you own, with its own `id`, its own
   certificate, its own reference value and its own status. `offered` says
   whether your Trusted Partners can currently see it as something you would
   trade. A card can be yours and not be offered; withdrawing an offer does not
   remove the card, and never did anything so drastic on purpose — it used to be
   the only way to say it.

   THE STATUS IS THE SERVER'S ANSWER, carried on the row. Available, reserved,
   committed, traded — the server derives it from every opportunity under the
   domain's rules, and this file reads `copy.status`. It does not look at
   opportunities and work it out: a second implementation of a rule is a second
   answer to it, and the two would disagree on exactly the cases that matter.

   WHO IS INTERESTED, BY EXPLICIT ID. `interests` carries `{ partnerId,
   binderId, at }` — `binderId` is legacy naming for a collector copy id, kept
   as written-down debt (domain/README.md) rather than renamed inside the
   interest model by this batch. The server has already scoped it to this
   Collector's own
   copies and their related partners. A copy shows the partners whose interest
   row names THAT copy's id — `groupBy(state.interests, "binderId")` — and the
   partner's name comes from `partners` by explicit `partnerId`. A partner the
   projection does not name is not substituted with another.

   THE REFERENCE VALUE IS YOURS. `market` is the Collector's own note of what a
   copy is worth; the projection strips it for every Trusted Partner
   (`COLLECTOR_COPY_FOR_PARTNER`), so it is theirs alone. It is labelled as their own
   figure rather than as a price MetYet computed, because MetYet did not
   compute it.

   NO PICTURES, HONESTLY. `photos` holds references like `binder:t15:front`,
   not URLs — the product does not serve images yet. So a copy says in words
   whether it has pictures, and never pretends to show one.
   ========================================================================== */

import React from "react";
import { Panel, Record, Fact, Tag } from "../parts.jsx";
import { rows, indexById, groupBy, text, day, money, plural, cardTitle, cardSetLine,
  gradeLine, isGraded, cardMarks, statusLabel, photoNote, byRecency } from "../present.js";

export default function MyCards({ state }) {
  const copies = rows(state && state.collectorCopies);
  const catalog = indexById(state && state.catalog);
  const interestsByCopy = groupBy(state && state.interests, "binderId");
  const partnerName = new Map();
  for (const p of rows(state && state.partners)) {
    if (p.id != null) partnerName.set(p.id, text(p.name));
  }

  const ordered = byRecency(copies, "addedAt");

  return (
    <Panel
      title="Your cards"
      note={copies.length ? plural(copies.length, "card", "cards") : null}
      empty={copies.length ? null
        : "You haven't recorded any cards yet. A card here is one you own. Offering one is a "
          + "separate choice — your Trusted Partners see only the cards you're offering."}
    >
      {ordered.map((copy) => {
        const card = catalog.get(copy.cardId) || null;
        const graded = isGraded(card);
        /* The partners whose interest row names THIS copy. */
        const interested = (interestsByCopy.get(copy.id) || [])
          .map((i) => partnerName.get(i.partnerId))
          .filter(Boolean);

        return (
          <Record
            key={copy.id}
            title={cardTitle(card) || "A card that isn't in your catalogue"}
            subtitle={cardSetLine(card)}
            marks={cardMarks(card)}
            tags={
              <>
                <Tag>{gradeLine(card)}</Tag>
                {/* The SERVER's answer, read from the row. */}
                <Tag tone={copy.status === "available" ? null : "strong"}>{statusLabel(copy.status)}</Tag>
                {/* OWNING IS THE ROW; OFFERING IS THIS TAG. Said in both
                    directions on purpose: "not offered" is a real answer a
                    Collector chose, not an absence, and a tag that appeared
                    only when true would read as one. */}
                <Tag tone={copy.offered === true ? "strong" : null}>
                  {copy.offered === true ? "Offered" : "Not offered"}
                </Tag>
              </>
            }
            facts={
              <>
                <Fact label={graded ? "Cert" : "Serial"} value={text(copy.cert)} />
                <Fact label="Your reference value" value={money(copy.market)} />
                <Fact label="Added" value={day(copy.addedAt)} />
                <Fact label="Photos" value={photoNote(copy.photos)} />
              </>
            }
          >
            {interested.length ? (
              <p className="mcs-rec-note">
                <span className="mcs-fact-l">Interested</span>
                {interested.join(" · ")}
              </p>
            ) : null}
          </Record>
        );
      })}
    </Panel>
  );
}
