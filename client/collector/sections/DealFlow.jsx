/* ============================================================================
   DEAL FLOW — WHO I TRUST HAS THE THING I ASKED FOR

   One question, and the screen answers only that one:

     Which physical copies, in shops I have a relationship with, are the card
     I said I wanted, in the grade and condition I said I wanted it?

   ORGANISED BY THE GOAL, NEVER BY THE SHOP OR BY WHAT IS NEW. A Collector
   arrives here holding a want, not browsing. So the Goal is the heading and the
   copies sit under it, and a shop appears as many times as it has an answer.
   That is the opposite shape from a listing feed, deliberately: there is no For
   You, no New, no Ending Soon, no Nearby, nothing sorted by price and nothing
   scored. Those answer "what might I want?", which nobody asked.

   IT SHOWS THE COPIES, WHICH IS THE WHOLE POINT. Until now a Collector was told
   "Northline has 2" and could not see which two. Every fact needed to show them
   properly — grade, condition, certificate, photographs, the asking price — has
   been arriving in `state.inventory` since Batch 6 and was rendered nowhere.
   This file renders what was already in the browser; it adds no field, asks for
   no new read and sends no command.

   QUALIFICATION, AND NOTHING PAST IT (this batch). The screen kept no controls
   at all while Inspect and Request Photos were unexposed, because a greyed-out
   button is the product promising something it has not built. They are exposed
   now, so they are here — and nothing else is. There is still no offer, no
   price, no Market Value, no Pending and no message box, because those are
   transaction, and the line this screen stops at is the one before it:

     Inspect         look properly at THIS physical copy
     Request photos  ask to be shown it before deciding anything

   Neither reserves the card, tells the shop you will buy it, gives you a claim
   ahead of anybody else, or begins a deal. Several Collectors may be inspecting
   one copy at the same moment and none of them is ahead. What they do is let a
   person answer "is this specific copy worth continuing with?", which is the
   question that was unanswerable here before.

   WHAT IT MAY SAY ABOUT ANOTHER PERSON'S DEAL: nothing. Every field below comes
   from `INVENTORY_FOR_COLLECTOR`, the server's allow-list for a Collector, and
   a copy held by somebody else's deal never reaches it at all — the projection
   drops the row. There is no rival opportunity id here, no rival collector, no
   stage, no terms, and no `pendingFor`, because none of them is in the data
   this file can see.

   THE EMPTY STATES ARE THE INTERESTING PART. Four different silences mean four
   different things, and telling them apart is most of this screen's value:

     no Trusted Partners     nobody to have it
     no Goals                nothing asked for
     asked, nobody has it    a true and ordinary answer
     they have the card,     the criteria did their job — and this one is
     but not as described    worth saying out loud, because otherwise the
                             screen looks broken to somebody who can see the
                             card in a shop's window

   The last is computed from rows already present: a copy of the same canonical
   card, at a related shop, available, which this Goal did not match. No new
   projection, no second matching rule — the absence is read from the same data
   the presence is.
   ========================================================================== */

import React, { useEffect, useMemo, useState } from "react";
import { Panel, Record, Fact, Tag } from "../parts.jsx";
import CardArt from "../../card-art.jsx";
import { rows, text, money, plural, gradeLine, gradeProblem, gradeConflictLine,
  photoNote, tierIntent, tierLabel, criteriaLine } from "../present.js";

export default function DealFlow({ state, onBrowseCards = null,
  onInspect = null, onEndInspection = null, onRequestPhotos = null }) {
  const goals = rows(state && state.goals);
  const partners = rows(state && state.partners);
  const inventory = rows(state && state.inventory);
  const reviews = rows(state && state.copyReviews);
  const requests = rows(state && state.photoRequests);

  /* WHAT THIS COLLECTOR IS ALREADY DOING WITH EACH COPY, read from the rows the
     server sent and derived nowhere else. `copyReviews` and `photoRequests` are
     already scoped to this Collector by the projection, so an open row here is
     this person's own — there is no other Collector's activity to filter out,
     and none arrives to be filtered. */
  const openReview = new Map();
  for (const r of reviews) if (!r.endedAt && r.invId != null) openReview.set(r.invId, r);
  const openRequest = new Set();
  const answeredRequest = new Set();
  for (const r of requests) {
    if (r.invId == null) continue;
    if (r.fulfilledAt) answeredRequest.add(r.invId);
    else openRequest.add(r.invId);
  }

  const [busy, setBusy] = useState({});
  const [trouble, setTrouble] = useState(null);
  /* ONE SENDER FOR ALL THREE, so a refusal is reported the same way whichever
     control produced it. The server is what decides; this only says so. */
  /* ONE PRESS PER CONTROL, NOT ONE PRESS PER SCREEN. An adversarial run found a
     single `busy` flag swallowing a press on a DIFFERENT copy while the first
     was in flight: the other buttons still looked live and did nothing, with no
     message. Two copies are two independent things to ask about. */
  const run = async (key, invId, send, verb) => {
    if (!send || busy[key]) return;
    setBusy((held) => ({ ...held, [key]: true }));
    setTrouble((held) => (held && held.invId === invId ? null : held));
    try {
      const answer = await send();
      if (answer && answer.ok === false) {
        setTrouble({ invId, message: answer.refused === "copy-unavailable"
          /* The server gives one answer for pending, promised and sold, so this
             says one thing back. Which of the three it was is the business of
             the people in that deal. */
          ? "That copy isn't available any more."
          : `Couldn't ${verb} just now.` });
      }
    } catch (error) {
      setTrouble({ invId, message: `Couldn't ${verb} just now.` });
    } finally {
      setBusy((held) => { const next = { ...held }; delete next[key]; return next; });
    }
  };
  const discoveries = rows(state && state.discoveries);

  const partnerName = new Map();
  for (const p of partners) if (p.id != null) partnerName.set(p.id, text(p.name));
  const copyById = new Map();
  for (const c of inventory) if (c.invId != null) copyById.set(c.invId, c);

  /* One entry per Goal that has at least one answer. `discoveries` is keyed by
     (goal, partner), so a Goal matched by two shops arrives as two rows and is
     gathered back together here — the Collector's question is about the card,
     and which shops have it is the answer, not the heading. */
  const answers = new Map();
  for (const d of discoveries) {
    if (d.goalId == null) continue;
    const held = answers.get(d.goalId) || [];
    held.push(d);
    answers.set(d.goalId, held);
  }

  /* A card the Collector asked for that a related shop HAS, in a form they did
     not ask for. Read from the same projection: same canonical card, still
     available, and not among the copies THIS Goal matched.

     PER GOAL, NOT ACROSS ALL OF THEM. An earlier version built one set from
     every discovery, so two Goals for one card in different grades cancelled
     each other out: the copy that satisfied the first was treated as "matched"
     by the second, which then said nobody had the card at all — to the one
     person who can see it in the shop's window. The exclusion belongs to the
     Goal being rendered. */
  const nearMissCount = (goal, matched) => inventory.filter((c) =>
    c.canonicalCardId === goal.canonicalCardId
    && c.archived !== true && c.status === "available"
    && !matched.has(c.invId)).length;

  /* Goals that have an answer come first, in the order the server produced
     them; then the ones that do not, so a person sees what is there before
     what is not. Nothing is scored and nothing is ranked. */
  const ordered = useMemo(() => {
    const withAnswers = goals.filter((g) => (answers.get(g.id) || []).length > 0);
    const without = goals.filter((g) => (answers.get(g.id) || []).length === 0);
    return [...withAnswers, ...without];
  }, [goals, discoveries]);

  /* The catalogue is asked once, for every card on the screen, exactly as every
     other Collector surface asks it. A card whose description has not arrived
     still renders — the shop still has it. */
  const shownKey = ordered.map((g) => g.canonicalCardId).filter(Boolean).join(",");
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
      } catch (error) { /* a card without a caption is still a card */ }
    })();
    return () => { current = false; };
  }, [shownKey, onBrowseCards]);

  const totalCopies = discoveries.reduce((n, d) => n + rows(d.invIds).length, 0);

  /* The four silences. Ordered from the one furthest from the person's control
     to the one nearest it. */
  const empty = !partners.length
    ? "You have no Trusted Partners yet. A shop invites you, and once you accept they "
      + "can see what you're looking for — and you can see what they have."
    : !goals.length
      ? "You haven't said what you're looking for yet. Find a card in Browse and tell "
        + "MetYet what you want, and any of your shops that has one will show up here."
      : null;

  return (
    <Panel
      title="What your shops have"
      note={totalCopies
        ? plural(totalCopies, "copy that matches", "copies that match")
        : null}
      empty={empty}
    >
      {!empty && ordered.map((goal) => {
        const card = described[goal.canonicalCardId] || null;
        const found = answers.get(goal.id) || [];
        const matched = new Set(found.flatMap((d) => rows(d.invIds)));
        const missed = nearMissCount(goal, matched);
        const copies = found.flatMap((d) => rows(d.invIds)
          .map((invId) => ({ partnerId: d.partnerId, copy: copyById.get(invId) }))
          .filter((x) => x.copy));

        /* AND THE COPIES THIS COLLECTOR IS STILL IN THE MIDDLE OF.

           `discoveries` is the server's answer to "which copies match, and are
           available" — so a copy stops being a discovery the moment somebody
           else's deal takes it. An adversarial run found that this made the
           whole point of the batch invisible: the projection kept the copy for
           a Collector who was mid-inspection, and this screen, which reads only
           discoveries, dropped it anyway. They lost the card off the screen
           exactly as before, and with it the only way to reach Done inspecting
           — so the open review pinned the copy into their projection for good.

           These are added back from the projection they are already in, under
           the Goal whose card they are, and they carry no Inspect or Request
           photos control because the door is shut. What they carry is the
           truth: this one is no longer available, and here is how to close it
           off. */
        const alsoQualifying = inventory
          .filter((c) => c.canonicalCardId === goal.canonicalCardId
            && !matched.has(c.invId)
            && (openReview.has(c.invId) || openRequest.has(c.invId)))
          .map((c) => ({ partnerId: c.partnerId, copy: c, closed: true }));
        const shown = [...copies, ...alsoQualifying];
        const title = (card && card.cardName) || "Loading this card…";
        const sub = card
          ? [text(card.expansionName), card.collectorNumber ? `#${card.collectorNumber}` : null]
            .filter(Boolean).join(" · ") || null
          : null;

        return (
          <article className="mcs-group" key={goal.id}>
            <div className="mcs-group-head">
              <CardArt src={card && card.imageSmall} name={card && card.cardName}
                wrap="mcs-group-art" plate="mcs-art-plate" decorative />
              <div className="mcs-rec-id">
                <div className="mcs-rec-t">{title}</div>
                {sub ? <div className="mcs-rec-s">{sub}</div> : null}
                <div className="mcs-rec-tags">
                  <Tag tone={goal.tier === "primary" ? "strong" : null}>
                    {tierIntent(goal.tier) || tierLabel(goal.tier)}
                  </Tag>
                  {copies.length
                    ? <Tag>{plural(copies.length, "copy", "copies")}</Tag>
                    : null}
                </div>
                <div className="mcs-rec-facts">
                  <Fact label="You asked for"
                    value={criteriaLine(goal.desired) || "any grade or condition"} />
                </div>
              </div>
            </div>

            {shown.length === 0 ? (
              <p className="mcs-df-none">
                {missed > 0
                  /* The one silence worth explaining. A shop has the card; it is
                     not the card they described. Said without naming which shop,
                     because a copy this Goal did not match is a copy the
                     Collector has no claim on and no business being told about
                     in any more detail than this. */
                  ? `No copies match what you asked for — though ${plural(missed, "copy", "copies")} `
                    + `of this card ${missed === 1 ? "is" : "are"} available at your shops `
                    + "in a different grade or condition."
                  : "None of your shops has this one right now."}
              </p>
            ) : (
              <ul className="mcs-df-copies">
                {shown.map(({ partnerId, copy, closed }) => {
                  const conflict = gradeProblem(copy) ? gradeConflictLine(copy) : null;
                  const looking = openReview.get(copy.invId) || null;
                  const asked = openRequest.has(copy.invId);
                  const answered = answeredRequest.has(copy.invId);
                  const photographed = !!(copy.photos && copy.photos.front && copy.photos.back);
                  return (
                    <li key={copy.invId} className="mcs-df-copy">
                      <span className="mcs-df-shop">
                        {partnerName.get(partnerId) || "A Trusted Partner"}
                      </span>
                      <span className="mcs-df-facts">
                        {gradeLine(copy) ? <span className="mcs-df-grade">{gradeLine(copy)}</span> : null}
                        {text(copy.cert) ? <span className="mcs-df-cert">{`Cert ${text(copy.cert)}`}</span> : null}
                        {photoNote(copy.photos) ? <span className="mcs-df-photo">{photoNote(copy.photos)}</span> : null}
                        {money(copy.ask) ? <span className="mcs-df-ask">{money(copy.ask)}</span> : null}
                      </span>
                      {conflict ? <span className="mcs-df-note">{conflict}</span> : null}

                      {/* QUALIFICATION, ON THE COPY IT IS ABOUT. The controls sit
                          on the physical copy's own row and never on the Goal,
                          because inspecting is something you do to one object.
                          Nothing here is disabled to suggest a locked feature:
                          a control the Collector cannot use is simply absent. */}
                      <span className="mcs-df-do">
                        {closed ? (
                          <span className="mcs-df-state">No longer available</span>
                        ) : null}
                        {trouble && trouble.invId === copy.invId
                          ? <span className="mcs-df-trouble" role="status">{trouble.message}</span>
                          : null}
                        {looking ? (
                          <>
                            <span className="mcs-df-state">You're inspecting this copy</span>
                            {onEndInspection ? (
                              <button type="button" className="mcs-go quiet"
                                disabled={!!busy[`end:${copy.invId}`]}
                                onClick={() => run(`end:${copy.invId}`, copy.invId,
                                  () => onEndInspection(looking.id), "close that")}>
                                Done inspecting
                              </button>
                            ) : null}
                          </>
                        ) : closed ? null : onInspect ? (
                          <button type="button" className="mcs-go"
                            disabled={!!busy[`look:${copy.invId}`]}
                            onClick={() => run(`look:${copy.invId}`, copy.invId,
                              () => onInspect(copy.invId), "open that")}>
                            Inspect
                          </button>
                        ) : null}

                        {/* THE EVIDENCE ASK. Once both faces exist there is
                            nothing to ask for, so the control goes rather than
                            sitting there doing nothing. */}
                        {closed ? null : photographed ? null : asked ? (
                          <span className="mcs-df-state">Photos requested</span>
                        ) : onRequestPhotos ? (
                          <button type="button" className="mcs-go quiet"
                            disabled={!!busy[`ask:${copy.invId}`]}
                            onClick={() => run(`ask:${copy.invId}`, copy.invId,
                              () => onRequestPhotos(copy.invId), "ask for photos")}>
                            Request photos
                          </button>
                        ) : null}
                        {photographed && answered
                          ? <span className="mcs-df-state">Photos arrived</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        );
      })}
    </Panel>
  );
}
