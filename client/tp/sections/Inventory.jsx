/* ============================================================================
   INVENTORY — WHAT YOU HAVE, COPY BY PHYSICAL COPY

   Every row here is one InventoryCopy: one physical card, with its own `invId`,
   its own certificate, its own acquisition cost and its own status. That is the
   whole design of this screen, and the reason it is not a list of CARDS with
   quantities.

   ACQUISITION COST BELONGS TO THE COPY, AND ONLY TO THE COPY. It is read as
   `copy.cost` from the row being rendered — never looked up by `cardId`, never
   averaged, never taken from another copy of the same card. Three PSA 9
   Charizards bought at £3,100, £3,276 and £3,400 are three different numbers
   against three different rows, and a screen that showed one of them three
   times would be lying about money. A test holds exactly that case.

   It is also TP-private. It reaches this browser because the server projects a
   partner's OWN inventory rows in full (INVENTORY_FOR_COLLECTOR strips `cost`
   and `acquired` for everybody else). It is labelled as yours, and it is never
   combined with the ask into a margin: this product does not compute profit,
   and a number nobody sent is not a number to show. The catalogue's own `value`
   field is deliberately not rendered either — its meaning is not established as
   a market price, and presenting it as one would be inventing pricing.

   STATUS IS THE SERVER'S ANSWER. Available, committed, reserved, sold, traded —
   the server derives it from every opportunity under the domain's rules, and
   the row carries the result. This file does not look at opportunities and work
   it out. A second implementation of a rule is a second answer to it.

   RAW OR GRADED IS THE CATALOGUE'S ANSWER, TOO. `grade` carries a grading label
   or the word "Raw"; `condition` qualifies a raw copy and is null for a graded
   one. Both are shown when present and neither is inferred from the other — a
   copy whose catalogue entry did not arrive still renders, because it is still
   a copy you own.
   ========================================================================== */

import React from "react";
import { Panel, Record, Fact, Tag } from "../parts.jsx";
import { rows, indexById, text, day, money, plural, cardTitle, cardSetLine,
  gradeLine, isGraded, cardMarks, statusLabel, byRecency } from "../present.js";

export default function Inventory({ state }) {
  const inventory = rows(state && state.inventory);
  const catalog = indexById(state && state.catalog);

  const live = byRecency(inventory.filter((i) => !i.archived), "addedAt", "acquired");
  const archived = inventory.length - live.length;

  return (
    <Panel
      title="Your copies"
      note={live.length ? plural(live.length, "copy", "copies") : null}
      empty={live.length ? null
        : (archived
          ? "Nothing on your shelf right now — every copy you've recorded is archived."
          : "Nothing in your inventory yet. Adding a copy isn't part of this release.")}
    >
      {live.map((copy) => {
        /* The catalogue entry for THIS copy's own cardId. */
        const card = catalog.get(copy.cardId) || null;
        const graded = isGraded(card);
        return (
          <Record
            key={copy.invId}
            title={cardTitle(card) || "A card not in your catalogue"}
            subtitle={cardSetLine(card)}
            marks={cardMarks(card)}
            tags={
              <>
                <Tag>{gradeLine(card)}</Tag>
                <Tag tone={copy.status === "available" ? null : "strong"}>{statusLabel(copy.status)}</Tag>
              </>
            }
            facts={
              <>
                {/* The certificate is the copy's, not the card's. */}
                <Fact label={graded ? "Cert" : "Serial"} value={text(copy.cert)} mono />
                <Fact label="Ask" value={money(copy.ask)} mono />
                {/* THIS copy's cost. Read from this row, by construction. */}
                <Fact label="Your cost" value={money(copy.cost)} mono />
                <Fact label="Acquired" value={day(copy.acquired)} mono />
                <Fact label="Added" value={day(copy.addedAt)} mono />
              </>
            }
          />
        );
      })}
      {archived ? (
        <p className="tps-foot-note">
          {plural(archived, "archived copy is", "archived copies are")} not shown.
        </p>
      ) : null}
    </Panel>
  );
}
