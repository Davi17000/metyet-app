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

   MAKING AN OFFER (Market Validation, Batch 3B). Past qualification there is
   now one more step, and only one: agreeing what a copy is worth. A copy a
   PRIMARY Goal matches may carry "Make an offer"; the offer opens inline on
   that copy and names the shop, the price they listed and whether it is Firm;
   once it is sent, the deal sits under the Goal it came from with where it
   stands and whose move it is. Every rule is the server's — this screen shows
   `turn`, `priceThread` and the captured terms it was sent, and the controls
   for the Collector's own move and nothing else. After a price is agreed the
   screen says so and what comes next, and offers no way to withdraw: ending
   an agreed deal is a different decision this batch does not build.

   QUALIFICATION, AND NOTHING PAST IT (Phase 5). The screen kept no controls
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
import { OfferEntry, PriceHistory, useSender, statusLine, termsLine, priceOnTable, viewerSeat,
  isUnresolved, myPriceMove, dollars, isLiveDeal, isEndedDeal, cardLine } from "../../negotiation.jsx";
import CardArt from "../../card-art.jsx";
import { rows, text, money, plural, gradeLine, gradeProblem, gradeConflictLine,
  photoNote, tierIntent, tierLabel, criteriaLine, stageLabel } from "../present.js";

export default function DealFlow({ state, onBrowseCards = null,
  onInspect = null, onEndInspection = null, onRequestPhotos = null,
  onOpenOffer = null, onCounterOffer = null, onAcceptOffer = null, onWithdrawOffer = null,
  onRefresh = null, focus = null, onFocusUsed = null }) {
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

  /* THIS COLLECTOR'S OWN DEALS, by the Goal each one is for. The projection
     sends only their own. The live one (if any) is what the Goal shows; with
     none live, the most recent that ended is said once, quietly, so an offer
     that was declined does not simply vanish. */
  const deals = rows(state && state.opportunities);
  /* Who is looking, as the server stated it. */
  const me = viewerSeat(state);
  const liveFor = new Map();
  const endedFor = new Map();
  for (const o of deals) {
    if (o.goalId == null) continue;
    if (isLiveDeal(o)) liveFor.set(o.goalId, o);
    else if (isEndedDeal(o)) {
      const held = endedFor.get(o.goalId);
      if (!held || String(o.updated || "") > String(held.updated || "")) endedFor.set(o.goalId, o);
    }
  }
  /* One offer panel open at a time, on the copy it is for. What the server
     said about it is kept against the GOAL: a re-read after a refusal can take
     the copy off the screen, and the message must not go with it. */
  const [composing, setComposing] = useState(null);
  const [offerSaid, setOfferSaid] = useState(null);
  const offer = useSender(onRefresh, (key, message) => setOfferSaid(message ? { key, message } : null));
  /* ARRIVING FROM A SHOP'S COPY IN BROWSE (P6-F5B): open on that Goal, and —
     for Make an Offer — with the existing composer open on that exact copy.
     Nothing is sent: the Collector still writes and submits the offer. */
  useEffect(() => {
    if (!focus) return;
    if (focus.compose && focus.invId) { offer.clear(); setOfferSaid(null); setComposing(focus.invId); }
    if (typeof document !== "undefined") {
      setTimeout(() => { const el = document.querySelector(`[data-goal="${focus.goalId}"]`); if (el && el.scrollIntoView) el.scrollIntoView({ block: "start" }); }, 0);
    }
    if (onFocusUsed) onFocusUsed();
  }, [focus]);

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
        const live = liveFor.get(goal.id) || null;
        const ended = live ? null : endedFor.get(goal.id) || null;
        /* An offer may open from a Primary Goal with nothing already live on
           it — the server holds one active offer per exact card, and a Goal is
           one exact card, so a live deal here is that offer. */
        const canOffer = !!onOpenOffer && goal.tier === "primary" && !live;
        const title = (card && card.cardName) || "Loading this card…";
        const sub = card
          ? [text(card.expansionName), card.collectorNumber ? `#${card.collectorNumber}` : null]
            .filter(Boolean).join(" · ") || null
          : null;

        return (
          <article className="mcs-group" key={goal.id} data-goal={goal.id}>
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

            {live ? (
              <LiveDeal deal={live} me={me} card={card} shop={partnerName.get(live.partnerId) || "your shop"}
                copy={copyById.get(live.invId) || null} sender={offer}
                onCounterOffer={onCounterOffer} onAcceptOffer={onAcceptOffer}
                onWithdrawOffer={onWithdrawOffer} />
            ) : ended ? (
              <p className="mcs-df-none">{statusLine(ended, me, partnerName.get(ended.partnerId) || "The shop")}</p>
            ) : null}

            {offerSaid && offerSaid.key.startsWith(`open:${goal.id}:`) ? (
              <p className="mcs-df-none mcs-df-trouble" role="status">{offerSaid.message}</p>
            ) : null}

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
                    <li key={copy.invId} className="mcs-df-copy" data-inv={copy.invId}>
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

                        {/* MAKE AN OFFER, on the copy it is about. */}
                        {canOffer && !closed && composing !== copy.invId ? (
                          <button type="button" className="mcs-go"
                            disabled={!!offer.busy}
                            onClick={() => { offer.clear(); setOfferSaid(null); setComposing(copy.invId); }}>
                            Make an offer
                          </button>
                        ) : null}
                      </span>
                      {canOffer && !closed && composing === copy.invId ? (
                        <div className="mcs-offer">
                          {cardLine(card) ? <p className="mcs-offer-card">{cardLine(card)}</p> : null}
                          <p className="mcs-offer-terms">
                            {`${partnerName.get(partnerId) || "This shop"} · `
                              + `${dollars(copy.ask) ? `Proposed Market Price ${dollars(copy.ask)}` : "No price listed"}`
                              + ` · ${copy.firmOnPrice === true ? "Firm on Price" : "Open to Offers"}`
                              + `${gradeLine(copy) ? ` · ${gradeLine(copy)}` : ""}`}
                          </p>
                          <OfferEntry cls="mcs" busy={!!offer.busy}
                            listed={typeof copy.ask === "number" && copy.ask > 0 ? copy.ask : null}
                            fixed={copy.firmOnPrice === true && typeof copy.ask === "number" && copy.ask > 0
                              ? Math.round(copy.ask) : null}
                            onCancel={() => { offer.clear(); setOfferSaid(null); setComposing(null); }}
                            onSubmit={async (price) => {
                              const sent = await offer.send(`open:${goal.id}:${copy.invId}`,
                                () => onOpenOffer(goal.id, copy.invId, price));
                              if (sent) setComposing(null);
                            }} />
                        </div>
                      ) : null}
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

/* ----------------------------------------------------------------- A LIVE DEAL
   Under the Goal it is for: the shop, the copy, the captured terms, where it
   stands, how the price got here, and — when the server says it is the
   Collector's move — Accept, Counter and Withdraw. While the shop is replying,
   the Collector may still withdraw. After agreement there are no controls:
   what comes next is the next stage, and it is said in words. */
function LiveDeal({ deal, me, card, shop, copy, sender, onCounterOffer, onAcceptOffer, onWithdrawOffer }) {
  const [countering, setCountering] = useState(false);
  const unresolved = isUnresolved(deal);
  const myMove = myPriceMove(deal, me);
  const onTable = priceOnTable(deal);
  const busy = !!sender.busy;
  return (
    <div className="mcs-offer mcs-offer-live" aria-label="Your offer">
      {cardLine(card) ? <p className="mcs-offer-card">{cardLine(card)}</p> : null}
      <p className="mcs-offer-terms">
        {[shop, copy ? gradeLine(copy) : null, copy && text(copy.cert) ? `Cert ${text(copy.cert)}` : null, termsLine(deal)]
          .filter(Boolean).join(" · ")}
      </p>
      <p className="mcs-offer-status" role="status">
        {statusLine(deal, me, shop, stageLabel(deal.stage))}
      </p>
      <PriceHistory cls="mcs" deal={deal} seat={me} other={shop} />
      {unresolved ? (
        countering ? (
          <OfferEntry cls="mcs" verb="Send counter" busy={busy}
            listed={typeof deal.listedPrice === "number" && deal.listedPrice > 0 ? deal.listedPrice : null}
            onCancel={() => { sender.clear(); setCountering(false); }}
            onSubmit={async (price) => {
              if (await sender.send(`counter:${deal.id}`, () => onCounterOffer(deal.id, price))) setCountering(false);
            }} />
        ) : (
          <div className="mcs-offer-do">
            {myMove && onTable != null && onAcceptOffer ? (
              <button type="button" className="mcs-go" disabled={busy}
                onClick={() => sender.send(`accept:${deal.id}`, () => onAcceptOffer(deal.id))}>
                {sender.busy === `accept:${deal.id}` ? "Accepting…" : `Accept ${dollars(onTable)}`}
              </button>
            ) : null}
            {myMove && onCounterOffer ? (
              <button type="button" className="mcs-go quiet" disabled={busy}
                onClick={() => { sender.clear(); setCountering(true); }}>Counter</button>
            ) : null}
            {onWithdrawOffer ? (
              <button type="button" className="mcs-go quiet" disabled={busy}
                onClick={() => sender.send(`withdraw:${deal.id}`, () => onWithdrawOffer(deal.id))}>
                {sender.busy === `withdraw:${deal.id}` ? "Withdrawing…" : "Withdraw offer"}
              </button>
            ) : null}
          </div>
        )
      ) : null}
      {sender.trouble ? <p className="mcs-df-trouble" role="status">{sender.trouble}</p> : null}
    </div>
  );
}
