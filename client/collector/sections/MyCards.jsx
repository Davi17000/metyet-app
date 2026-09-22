/* ============================================================================
   YOUR CARDS — WHAT YOU OWN, AND WHAT YOU ARE OFFERING

   THIS WAS CALLED THE TRADE BINDER AND IT WAS NEVER A BINDER (Phase 5 C2). It
   is the Collector's own cards — the mirror image of a Trusted Partner's
   Inventory, owned by the other seat. The word "Binder" belongs to the named
   grouping a Collector makes for themselves, which C3.4 finally builds
   alongside this screen.

   CARD FIRST, COPIES SECOND (Phase 5 C3.4). The durable model is copy-based and
   stays that way: every physical card a Collector owns is its own row with its
   own certificate, its own grading, its own reference value and its own
   `offered`. But a person looking for something looks for THE CHARIZARD and
   then works out which one, so the screen groups by canonical card and lists
   the copies underneath it.

   THE GROUP IS A HEADING, NOT A RECORD. It carries the card's identity — the
   picture, the name, the set and number — and nothing that would need to be
   averaged. In particular it NEVER shows a grade: a person holding a PSA 9 and
   a damaged raw copy of one card owns two very different objects, and any
   single grading for the pair would be a fact about neither. Aggregating one
   would be the same class of error C3.2 and C3.3 spent two batches removing.

   WHAT IT OWES ITS CANONICAL CARDS (C3.4). A copy stores the id the server
   minted and nothing else about the card. What a person reads is asked for in
   ONE request for the ids already on screen — `describe(ids)` — never one per
   row and never the legacy catalogue. Until C3.4 this screen looked its cards
   up in that legacy catalogue by `cardId`, which was right in the model Batch 5
   replaced and has been wrong since: a copy naming a CANONICAL card has no
   legacy row at all, so every production copy rendered as "a card that isn't in
   your catalogue". That is the debt C3.3 named and left here, and it is why
   this screen was not reachable until now.

   OWNING AND OFFERING ARE TWO DIFFERENT FACTS, and this screen shows both.
   `offered` says whether your Trusted Partners can currently see a copy as
   something you would trade. A card can be yours and not be offered;
   withdrawing an offer does not remove the card.

   AND WANTING IS A THIRD. A Goal for a card you already own is not a
   contradiction — it is somebody hunting a better copy, which is ordinary. When
   there is one, the group says so quietly, so that Want and Own stay visibly
   independent rather than looking like one toggle.

   WHAT YOU ARE OFFERING, DERIVED (C3.4). "Offered only" is a filter over the
   exact copies whose `offered` is true. It is computed here, from rows the
   server already sent, and stored nowhere: there is no Trade Binder record, no
   persisted view, and no second place that could disagree about what is on
   offer.

   THE STATUS IS THE SERVER'S ANSWER, carried on the row. Available, reserved,
   committed, traded — the server derives it from every opportunity under the
   domain's rules, and this file reads `copy.status`. It does not look at
   opportunities and work it out: a second implementation of a rule is a second
   answer to it, and the two would disagree on exactly the cases that matter.
   The same is true of grading, which arrives as `copy.grading` (C3.3).

   WHO IS INTERESTED, BY EXPLICIT ID. `interests` carries `{ partnerId,
   binderId, at }` — `binderId` is legacy naming for a collector copy id, kept
   as written-down debt (domain/README.md) rather than renamed here. C3.4 makes
   that collision as visible as it will ever be, because real Binders now exist
   one tab away; renaming it is a migration plus every reader of the trade
   model, and this is not that batch.

   NO PICTURES OF YOUR OWN COPY, HONESTLY. `photos` holds references like
   `binder:t15:front`, not URLs — the product does not serve a Collector's own
   photographs yet. So a copy says in words whether it has pictures. The picture
   on the group is the CATALOGUE's image of the card, which is a different thing
   and is not a photograph of anybody's copy.
   ========================================================================== */

import React, { useEffect, useMemo, useState } from "react";
import { Panel, Record, Fact, Tag } from "../parts.jsx";
import CardSpecification from "../CardSpecification.jsx";
import { rows, indexById, groupBy, text, day, money, plural, cardTitle, cardSetLine,
  gradeLine, isGraded, gradeConflictLine, cardMarks, statusLabel, photoNote,
  tierIntent, tierLabel, byRecency } from "../present.js";

export default function MyCards({ state, onBrowseCards = null, onSpecify = null }) {
  const copies = rows(state && state.collectorCopies);
  const catalog = indexById(state && state.catalog);
  const interestsByCopy = groupBy(state && state.interests, "binderId");
  const partnerName = new Map();
  for (const p of rows(state && state.partners)) {
    if (p.id != null) partnerName.set(p.id, text(p.name));
  }
  /* The Goal for a canonical card, if there is one. Read only to say so. */
  const goalFor = new Map();
  for (const g of rows(state && state.goals)) {
    if (g.canonicalCardId) goalFor.set(g.canonicalCardId, g);
  }

  const [offeredOnly, setOfferedOnly] = useState(false);
  /* THE SAME PANEL BROWSE OPENS, OPENED FROM HERE (C3.4). It is rendered as a
     sibling of this list and out of flow, exactly as Browse renders it over the
     grid — so the list underneath does not move and closing it returns to the
     surface that never went away. There is no second editing grammar: this
     section hands it `onSpecify` unchanged. */
  const [specifying, setSpecifying] = useState(null);

  /* WHAT IS ON SCREEN, GROUPED BY THE CARD RATHER THAN BY THE COPY. Order is
     the copies' own — most recently added card first — so the screen does not
     invent a ranking. */
  const groups = useMemo(() => {
    const shown = offeredOnly ? copies.filter((b) => b.offered === true) : copies;
    const out = [];
    const byKey = new Map();
    for (const copy of byRecency(shown, "addedAt")) {
      /* The group is keyed on the card's id — the canonical one, or the demo
         catalogue's where a legacy copy still names one. Never on a name. */
      const groupId = copy.canonicalCardId || `legacy:${copy.cardId}`;
      if (!byKey.has(groupId)) {
        const group = { groupId, canonicalCardId: copy.canonicalCardId || null,
          cardId: copy.canonicalCardId ? null : copy.cardId, copies: [] };
        byKey.set(groupId, group);
        out.push(group);
      }
      byKey.get(groupId).copies.push(copy);
    }
    return out;
  }, [copies, offeredOnly]);

  /* ONE REQUEST FOR THE IDS THIS SCREEN ALREADY HOLDS (C3.4), the same way
     Goals has asked since Batch 7. Never one per row, never the catalogue, and
     a card whose description has not arrived still renders — it is still a card
     somebody owns. */
  const canonicalIds = useMemo(
    () => [...new Set(copies.map((b) => b.canonicalCardId).filter(Boolean))],
    [copies.map((b) => b.canonicalCardId).join(",")]);
  const [described, setDescribed] = useState({});
  useEffect(() => {
    if (!onBrowseCards || !canonicalIds.length) return undefined;
    let current = true;
    (async () => {
      try {
        const answer = await onBrowseCards.describe(canonicalIds);
        if (!current) return;
        const next = {};
        for (const card of rows(answer && answer.cards)) next[card.canonicalCardId] = card;
        setDescribed((held) => ({ ...held, ...next }));
      } catch (error) { /* a shelf without captions is still a shelf */ }
    })();
    return () => { current = false; };
  }, [canonicalIds.join(","), onBrowseCards]);

  const offeredCount = copies.filter((b) => b.offered === true).length;

  return (
    <Panel
      title="Your cards"
      note={copies.length ? plural(copies.length, "card", "cards") : null}
      empty={copies.length ? null
        : "You haven't recorded any cards yet. A card here is one you own. Offering one is a "
          + "separate choice — your Trusted Partners see only the cards you're offering."}
    >
      {/* WHAT YOU ARE OFFERING IS A FILTER, NOT A PLACE. Derived from the copies
          already on the row; nothing is stored, and there is no Trade Binder. */}
      {copies.length ? (
        <p className="mcs-filter">
          <button type="button" className={`mcs-go${offeredOnly ? "" : " quiet"}`}
            aria-pressed={offeredOnly} onClick={() => setOfferedOnly((on) => !on)}>
            Offered only
          </button>
          <span className="mcs-dim">
            {offeredCount === 0 ? "You're not offering any of these yet."
              : `You're offering ${offeredCount} of ${copies.length}.`}
          </span>
        </p>
      ) : null}

      {copies.length && !groups.length ? (
        <p className="mcs-empty">You're not offering any of your cards right now.</p>
      ) : null}

      {specifying ? (
        <div className="mcs-spec-scrim">
          {/* A describe row carries everything the panel reads from both `card`
              and `context`, so it is handed the same row twice rather than
              being taught a second shape. */}
          <CardSpecification
            card={specifying}
            context={specifying}
            state={state}
            onCommit={onSpecify}
            onClose={() => setSpecifying(null)}
          />
        </div>
      ) : null}

      {groups.map((group) => {
        const known = group.canonicalCardId ? described[group.canonicalCardId] : null;
        /* A legacy copy names the demo catalogue's row; a canonical one names
           nothing this projection carries, and is described above. */
        const legacy = group.cardId ? catalog.get(group.cardId) || null : null;
        const goal = group.canonicalCardId ? goalFor.get(group.canonicalCardId) : null;
        const title = (known && known.cardName) || cardTitle(legacy)
          || (group.canonicalCardId ? "Loading this card…" : "A card that isn't in your catalogue");
        const sub = known
          ? [text(known.expansionName), known.collectorNumber ? `#${known.collectorNumber}` : null]
            .filter(Boolean).join(" · ") || null
          : cardSetLine(legacy);
        const marks = known
          ? [known.printRun, known.finish, known.language].filter(Boolean)
          : cardMarks(legacy);
        /* Only a canonical card can be specified: the panel writes facts about
           an id the server minted, and a demo row has none. */
        const open = onSpecify && known ? () => setSpecifying(known) : null;

        return (
          <article className="mcs-group" key={group.groupId}>
            <div className="mcs-group-head">
              {/* THE CATALOGUE'S PICTURE OF THE CARD, where there is one. A card
                  with none keeps the same empty tile rather than repeating its
                  own name beside the name: Browse draws the name in its plates
                  because in a grid the plate IS the identification, and here the
                  title is already an inch away. */}
              <span className="mcs-group-art">
                {known && known.imageSmall
                  ? <img src={known.imageSmall} alt="" loading="lazy" />
                  : null}
              </span>
              <div className="mcs-rec-id">
                <div className="mcs-rec-t">{title}</div>
                {sub ? <div className="mcs-rec-s">{sub}</div> : null}
                {marks.length ? (
                  <div className="mcs-marks">
                    {marks.map((m) => <span key={m} className="mcs-mark">{m}</span>)}
                  </div>
                ) : null}
                <div className="mcs-rec-tags">
                  <Tag>{plural(group.copies.length, "copy", "copies")}</Tag>
                  {/* WANT STAYS VISIBLY INDEPENDENT OF OWN. A Goal for a card
                      you already own is somebody hunting a better copy, which
                      is ordinary and must not look like a contradiction. */}
                  {goal ? (
                    <Tag tone={goal.tier === "primary" ? "strong" : null}>
                      {tierIntent(goal.tier) || tierLabel(goal.tier)}
                    </Tag>
                  ) : null}
                </div>
              </div>
              {open ? (
                <button className="mcs-go quiet" type="button" onClick={open}>Open</button>
              ) : null}
            </div>

            {/* EVERY PHYSICAL COPY, ON ITS OWN TERMS. */}
            {group.copies.map((copy) => {
              const graded = isGraded(copy);
              const conflict = gradeConflictLine(copy);
              const interested = (interestsByCopy.get(copy.id) || [])
                .map((i) => partnerName.get(i.partnerId))
                .filter(Boolean);
              return (
                <Record
                  key={copy.id}
                  title={gradeLine(copy) || "Not stated"}
                  tags={
                    <>
                      {/* A COPY THAT DISAGREES WITH ITSELF SAYS SO (C3.3). */}
                      {conflict ? <Tag tone="unknown">{`Says ${conflict}`}</Tag> : null}
                      {/* The SERVER's answer, read from the row. */}
                      <Tag tone={copy.status === "available" ? null : "strong"}>
                        {statusLabel(copy.status)}
                      </Tag>
                      {/* OWNING IS THE ROW; OFFERING IS THIS TAG. Said in both
                          directions on purpose: "not offered" is a real answer
                          a Collector chose, not an absence. */}
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
          </article>
        );
      })}
    </Panel>
  );
}
