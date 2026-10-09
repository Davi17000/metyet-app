/* ============================================================================
   OPPORTUNITIES — WHAT YOU'RE COORDINATING, AND WHERE EACH ONE STANDS

   Goals are the only transaction workflow in MetYet, and an Opportunity is a
   Goal being worked. So every row here is read against the Goal it names and
   the Collector it belongs to, both found by the identifiers the row carries.

   THE STAGE IS THE SERVER'S, AND AN UNFAMILIAR ONE SURVIVES AS ITSELF. The
   five deal stages are labelled with the product's own words. A stage this
   build has never seen — a lifecycle the server grew after this bundle shipped
   — is rendered verbatim and marked as unfamiliar, never mapped to the nearest
   known stage. Telling a Trusted Partner that a deal is at "Deal" when the
   server said something else is worse than showing them a word they have to
   ask about.

   That is also why the list is ordered by DATE rather than by lifecycle
   position: an unfamiliar stage has no position in an order this build knows,
   and inventing one would be the same coercion by another route. Most recently
   moved first, using the `updated` the server sent.

   COMPLETED IS A SEPARATE LIST, not a filtered-out one. Work that is finished
   is still work you did, and hiding it entirely makes a quiet week look like an
   empty one. "Not completed" is the only lifecycle judgement made here, and it
   is a comparison against one canonical value rather than a stage order.

   THE COPY, WHEN THERE IS ONE, IS THE EXACT COPY. An opportunity that names an
   `invId` is bound to one physical card; its certificate and your cost for THAT
   copy are read from your own inventory row with that `invId`. An opportunity
   that names none — which is most of them before a price is agreed — shows
   none, rather than picking a copy of the same card that looks right.

   ONE THING HERE ACTS, AND IT IS THE PRICE (Market Validation, Batch 3B).
   Until this batch nothing here acted. Now a Collector's offer is something a
   shop answers: Accept, Counter (in dollars or a percentage of the price that
   was listed when the offer opened — available even when that price was
   Firm) or Decline. Those three, and only while the server says it is the
   shop's move on a price. Every later stage still reads: no stage button and
   no disabled affordance pretending to be one.

   ORGANISED BY WHO MOVES NEXT. A deal waiting on THIS shop's answer to a
   price is in Ready to coordinate, ahead of the shelf overlaps — it is the
   most actionable thing on the page. Everything else live stays in In
   progress, each row saying plainly whose turn it is. Whose turn is the
   server's (`turn`, projected from the domain's one turn engine); this file
   reads it and never works it out.

   ---------------------------------------------------------------------------
   AND NOW THE PART THAT COMES BEFORE ANY OF THAT (Phase 5 Batch 8).

   Until this batch a Trusted Partner with nothing in progress saw an empty
   screen — true, and useless, because the thing that would have made it not
   empty was sitting in two records nobody had put side by side. READY TO
   COORDINATE is those two records: a collector in your network has said they
   want one exact card, and one exact card on your shelf is that card.

   IT IS NOT A MATCH SCORE AND IT IS NOT A LEAD. The server computed it from an
   equality on a canonical card id inside an accepted relationship, and there is
   nothing to tune: every row is the same strength of true. Nothing is ranked,
   nothing is recommended, and no stranger appears — a collector who is not in
   your network is not in this projection at all.

   IT RESERVES NOTHING. Two collectors wanting the same card produce two rows
   over the same copies, and neither takes anything from the other. A copy is
   only ever spoken for by a deal, which is what the lists below are.

   AND IT IS NOT AN OPPORTUNITY YET. An Opportunity begins when a collector
   makes an offer; this is the moment before, which is why it is a separate
   panel with its own word rather than a row in "In progress" wearing a stage
   it has not reached.
   ========================================================================== */

import React, { useEffect, useState } from "react";
import { Panel, Record, Fact, Tag } from "../parts.jsx";
import { OfferEntry, PriceHistory, useSender, statusLine, termsLine, priceOnTable, viewerSeat,
  isUnresolved, isLiveDeal, myPriceMove, dollars, isEndedDeal, cardLine } from "../../negotiation.jsx";
import { rows, indexById, text, day, money, plural, cardTitle, cardSetLine,
  gradeLine, stageLabel, isKnownStage, tierLabel, supplyLine, byRecency } from "../present.js";

const COMPLETED = "completed";

export default function Opportunities({ state, onBrowseCards = null,
  onCounterOffer = null, onAcceptOffer = null, onDeclineOffer = null, onRefresh = null }) {
  const all = rows(state && state.opportunities);
  const catalog = indexById(state && state.catalog);
  const goals = indexById(state && state.goals);

  /* Who the other party is, by explicit id. `collectors` is the network;
     `counterparties` is bare identity for somebody named by a record but not in
     it. Both are the server's, and neither is a directory to browse. */
  const who = new Map();
  for (const c of [...rows(state && state.collectors), ...rows(state && state.counterparties)]) {
    if (c.id != null && !who.has(c.id)) who.set(c.id, text(c.name) || text(c.short));
  }
  /* Your own copies, by the id an opportunity would name. */
  const copies = new Map();
  for (const copy of rows(state && state.inventory)) {
    if (copy.invId != null) copies.set(copy.invId, copy);
  }

  /* Ended deals (declined or withdrawn) are not in progress; they are history
     and sit with the completed ones. */
  /* `o.stage !== COMPLETED` is this screen's own pre-Batch-3B grouping, kept
     as it was: it is a label comparison against one canonical value, and it
     is what lets a stage this build has never seen survive in In progress.
     Ended deals (the server's own outcome flag) join the finished ones. Who
     moves next is the server's `turn`, read by name. */
  const me = viewerSeat(state);
  const live = byRecency(all.filter((o) => o.stage !== COMPLETED && !isEndedDeal(o)), "updated");
  const yourMove = live.filter((o) => myPriceMove(o, me));
  const waiting = live.filter((o) => !myPriceMove(o, me));
  const done = byRecency(all.filter((o) => o.stage === COMPLETED || isEndedDeal(o)), "completedAt", "updated");

  /* READY TO COORDINATE — the server's overlaps, minus the ones already being
     worked. A discovery names the Goal it came from; a live deal names the Goal
     it is for. Where those are the same Goal and the same collector, the deal
     is the truer statement and the discovery would only repeat it. */
  const working = new Set(live.map((o) => `${o.goalId}::${o.partnerId}`));
  /* The last thing said about each deal, kept here rather than in the row: an
     answer that finds the deal already moved re-reads the server, and the deal
     can land in a different panel with the message still owed. */
  const [said, setSaid] = useState({});
  const sayAbout = (oppId) => (key, message) => setSaid((held) => ({ ...held, [oppId]: message }));
  const ready = rows(state && state.discoveries).filter((d) => !working.has(d.key));

  /* WHAT EACH ONE IS, ASKED FOR ONCE. The ids are in this projection already;
     the names are not, and a row that cannot say which card it is about is a
     row a person cannot act on. One request for the set — never one per row,
     and never the catalogue. */
  /* Batch 3B: and the cards the deals below are about, so an offer names the
     exact card and version it is for. Still one request for the set. */
  const readyIds = [...new Set([...ready.map((d) => d.canonicalCardId),
    ...all.map((o) => o.canonicalCardId)].filter(Boolean))];
  const [named, setNamed] = useState({});
  useEffect(() => {
    if (!onBrowseCards || !readyIds.length) return undefined;
    let current = true;
    (async () => {
      try {
        const answer = await onBrowseCards.describe(readyIds);
        if (!current) return;
        const next = {};
        for (const card of rows(answer && answer.cards)) next[card.canonicalCardId] = card;
        setNamed((held) => ({ ...held, ...next }));
      } catch (error) { /* an unnamed card is still a card you have */ }
    })();
    return () => { current = false; };
  }, [readyIds.join(","), onBrowseCards]);

  const overlap = (d) => {
    const card = named[d.canonicalCardId] || null;
    const sub = card
      ? [card.expansionName, card.collectorNumber ? `#${card.collectorNumber}` : null]
        .filter(Boolean).join(" · ") || null
      : null;
    return (
      <Record
        key={d.key}
        title={(card && card.cardName) || "A card MetYet is still describing"}
        subtitle={sub}
        tags={
          <>
            <Tag tone="strong">On your shelf</Tag>
            {d.tier ? <Tag>{tierLabel(d.tier)}</Tag> : null}
          </>
        }
        note={supplyLine(who.get(d.collectorId), d.tier, d.copies)}
        noteLabel="Why you're seeing this"
        facts={<Fact label="Your copies" value={d.copies ? String(d.copies) : null} mono />}
      />
    );
  };

  const line = (o) => {
    const card = catalog.get(o.cardId) || null;
    const goal = o.goalId != null ? goals.get(o.goalId) || null : null;
    /* The EXACT copy this deal is bound to, or none. Never another copy of the
       same card, however plausible it would look. */
    const copy = o.invId != null ? copies.get(o.invId) || null : null;
    const known = isKnownStage(o.stage);
    const grade = gradeLine(card);
    const subtitle = [cardSetLine(card), grade].filter(Boolean).join(" · ") || null;
    /* A deal on a catalogue card names it from the catalogue's description,
       with this copy's own grade; a legacy one keeps the line above. */
    const exact = !card && o.canonicalCardId
      ? [cardLine(named[o.canonicalCardId] || null), copy ? gradeLine(copy) : null].filter(Boolean).join(" · ") || null
      : null;

    return (
      <Record
        key={o.id}
        title={who.get(o.collectorId) || "A collector outside your network"}
        subtitle={exact || (cardTitle(card) ? `${cardTitle(card)}${subtitle ? ` — ${subtitle}` : ""}` : subtitle)}
        tags={
          <>
            <Tag tone={known ? "strong" : "unknown"}>{stageLabel(o.stage)}</Tag>
            {known ? null : <Tag>not a stage this version knows</Tag>}
            {goal ? <Tag>{tierLabel(goal.tier)}</Tag> : null}
            {turnTag(o)}
          </>
        }
        note={text(goal && goal.note)}
        noteLabel="Their goal"
        facts={
          <>
            <Fact label="Listed" value={money(o.listedPrice)} mono />
            <Fact label="Agreed" value={money(o.agreedPrice)} mono />
            {/* This copy's own cert and your own cost for it. */}
            <Fact label="Your copy" value={text(copy && copy.cert)} mono />
            <Fact label="Your cost" value={money(copy && copy.cost)} mono />
            <Fact label="Last moved" value={day(o.updated)} mono />
            <Fact label="Completed" value={day(o.completedAt)} mono />
          </>
        }
      >
        {isUnresolved(o) || isEndedDeal(o) ? (
          <PriceBlock deal={o} me={me} collector={who.get(o.collectorId) || "The collector"}
            onCounterOffer={onCounterOffer} onAcceptOffer={onAcceptOffer}
            onDeclineOffer={onDeclineOffer} onRefresh={onRefresh} report={sayAbout(o.id)} note={said[o.id] || null} />
        ) : null}
        {said[o.id] && !(isUnresolved(o) || isEndedDeal(o))
          ? <p className="tps-offer-problem tps-offer-said" role="status">{said[o.id]}</p> : null}
      </Record>
    );
  };
  /* Whose turn, in two words. Only for live deals; a finished one has none. */
  const turnTag = (o) => {
    if (!isLiveDeal(o) || !o.turn.seat) return null;
    if (me && o.turn.seat === me) return <Tag tone="strong">Your move</Tag>;
    return <Tag>{`Waiting for ${who.get(o.collectorId) || "the collector"}`}</Tag>;
  };

  return (
    <>
      {ready.length || yourMove.length ? (
        <Panel title="Ready to coordinate"
          note={[yourMove.length ? plural(yourMove.length, "offer to answer", "offers to answer") : null,
            ready.length ? plural(ready.length, "card", "cards") : null].filter(Boolean).join(" · ")}>
          {yourMove.map(line)}
          {ready.map(overlap)}
        </Panel>
      ) : null}

      <Panel
        title="In progress"
        note={waiting.length ? plural(waiting.length, "opportunity", "opportunities") : null}
        empty={waiting.length ? null
          : (yourMove.length
            ? "Nothing else in progress — the offers above are waiting on you."
            : all.length
            ? "Nothing in progress. Everything you've coordinated is complete."
            : "Nothing in progress yet. An opportunity begins from a collector's goal.")}
      >
        {waiting.map(line)}
      </Panel>

      {done.length ? (
        <Panel title="Completed" note={plural(done.length, "opportunity", "opportunities")}>
          {done.map(line)}
        </Panel>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------ THE PRICE
   Where an offer stands, how it got here, and — only when the server says it
   is this shop's move on a price — Accept, Counter or Decline. Counter is
   always there on the shop's move, including on a copy listed Firm on Price:
   Firm binds the Collector's OPENING, not the shop's reply. */
function PriceBlock({ deal, me, collector, onCounterOffer, onAcceptOffer, onDeclineOffer, onRefresh,
  report = null, note = null }) {
  const sender = useSender(onRefresh, report);
  const [countering, setCountering] = useState(false);
  const myMove = myPriceMove(deal, me);
  const onTable = priceOnTable(deal);
  const busy = !!sender.busy;
  return (
    <div className="tps-offer" aria-label="Price">
      <p className="tps-offer-terms">{termsLine(deal)}</p>
      <p className="tps-offer-status" role="status">{statusLine(deal, me, collector)}</p>
      <PriceHistory cls="tps" deal={deal} seat={me} other={collector} />
      {isUnresolved(deal) && myMove ? (
        countering ? (
          <OfferEntry cls="tps" verb="Send counter" busy={busy}
            listed={typeof deal.listedPrice === "number" && deal.listedPrice > 0 ? deal.listedPrice : null}
            onCancel={() => { sender.clear(); setCountering(false); }}
            onSubmit={async (price) => {
              if (await sender.send(`counter:${deal.id}`, () => onCounterOffer(deal.id, price))) setCountering(false);
            }} />
        ) : (
          <div className="tps-offer-do">
            {onTable != null && onAcceptOffer ? (
              <button type="button" className="tps-go" disabled={busy}
                onClick={() => sender.send(`accept:${deal.id}`, () => onAcceptOffer(deal.id))}>
                {sender.busy === `accept:${deal.id}` ? "Accepting…" : `Accept ${dollars(onTable)}`}
              </button>
            ) : null}
            {onCounterOffer ? (
              <button type="button" className="tps-go quiet" disabled={busy}
                onClick={() => { sender.clear(); setCountering(true); }}>Counter</button>
            ) : null}
            {onDeclineOffer ? (
              <button type="button" className="tps-go quiet" disabled={busy}
                onClick={() => sender.send(`decline:${deal.id}`, () => onDeclineOffer(deal.id))}>
                {sender.busy === `decline:${deal.id}` ? "Declining…" : "Decline"}
              </button>
            ) : null}
          </div>
        )
      ) : null}
      {sender.trouble || note ? <p className="tps-offer-problem" role="status">{sender.trouble || note}</p> : null}
    </div>
  );
}
