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

   EACH DEAL HAS ITS CONVERSATION (Milestone 2D.2). Under the price, behind
   one "Conversation" control so a list of deals stays a list: the same
   thread the Collector sees in their Deal Workspace, from this shop's side,
   through the shared `DealConversation` and the one messaging command. It is
   never read for intent — a message is not an answer to a price.

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
import { DealConversation, dealThread, messagesOf } from "../../deal-conversation.jsx";
import { useDealFreshness } from "../../deal-freshness.js";
import { CopyRow, liveRows, choosableCopies, looksUnavailable, myMove, turnOf, isSelectingStage, isValuingStage,
  selectRefusal } from "../../select-trade.jsx";

const COMPLETED = "completed";

export default function Opportunities({ state, onBrowseCards = null,
  onCounterOffer = null, onAcceptOffer = null, onDeclineOffer = null, onRefresh = null,
  onSendMessage = null, onSelectTrade = null, onDeselectTrade = null, onCloseSelection = null }) {
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
  /* Select Trade (M3A A3): choosing cards, or finishing the choice once the
     Collector is ready, is the shop's move too — the server's `turn` says so. */
  const selectMove = (o) => isSelectingStage(o) && myMove(o, me, "select-trade", "close-selection");
  const yourMove = live.filter((o) => myPriceMove(o, me) || selectMove(o));
  const waiting = live.filter((o) => !(myPriceMove(o, me) || selectMove(o)));
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
  /* Which conversations are open, kept here for the same reason: a deal that
     moves panel keeps its conversation open. */
  const [talking, setTalking] = useState({});
  const toggleTalk = (oppId) => setTalking((held) => ({ ...held, [oppId]: !held[oppId] }));
  /* Select Trade's on-screen draft, confirmation and refused rows, per deal
     (M3A A3) — kept here so a deal that moves panel keeps them. */
  const [selectUi, setSelectUi] = useState({});
  /* FRESHNESS (M3A A3). Opening Opportunities, coming back to the page, and
     every 15 seconds while it is visible, the live deals are read again; a
     deal that changed says what happened, quietly, on its own record. An open
     "Start valuing" confirmation on a deal that changed is closed — the cards
     it named may not be the cards on the table. If a check fails, the deal
     actions pause until one succeeds. */
  const fresh = useDealFreshness({ state, seat: me, deals: live.map((o) => o.id), onRefresh,
    nameOf: (id) => { const o = all.find((x) => x.id === id); return o ? who.get(o.collectorId) || null : null; },
    /* A change also retires the last "Sent …" line: it was about the deal as it was. */
    onChange: (id) => setSelectUi((held) => (!held[id] ? held
      : held[id].confirming
        ? { ...held, [id]: { ...held[id], done: null, confirming: false, said: "This deal changed while you were confirming — check the cards." } }
        : { ...held, [id]: { ...held[id], done: null } })) });
  const frozen = fresh.failed;
  const ready = rows(state && state.discoveries).filter((d) => !working.has(d.key));

  /* WHAT EACH ONE IS, ASKED FOR ONCE. The ids are in this projection already;
     the names are not, and a row that cannot say which card it is about is a
     row a person cannot act on. One request for the set — never one per row,
     and never the catalogue. */
  /* Batch 3B: and the cards the deals below are about, so an offer names the
     exact card and version it is for. Still one request for the set. */
  /* M3A A3: and the Collector's copies a Select Trade may show — their
     Trade/Sell copies and the rows of deals choosing them. Still one request. */
  const selecting = all.filter((o) => isSelectingStage(o) || isValuingStage(o));
  const selectingFor = new Set(selecting.map((o) => o.collectorId));
  const readyIds = [...new Set([...ready.map((d) => d.canonicalCardId),
    ...all.map((o) => o.canonicalCardId),
    ...selecting.flatMap((o) => liveRows(o).map((r) => r.canonicalCardId)),
    ...rows(state && state.collectorCopies).filter((b) => selectingFor.has(b.collectorId)).map((b) => b.canonicalCardId),
  ].filter(Boolean))];
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
    const valuing = isValuingStage(o);
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
            {valuing ? <Tag tone="strong">Cards held · Value Trade coming soon</Tag>
              : <Tag tone={known ? "strong" : "unknown"}>{stageLabel(o.stage)}</Tag>}
            {known ? null : <Tag>not a stage this version knows</Tag>}
            {goal ? <Tag>{tierLabel(goal.tier)}</Tag> : null}
            {valuing ? null : turnTag(o)}
          </>
        }
        note={text(goal && goal.note)}
        noteLabel="Their goal"
        facts={
          <>
            <Fact label="Asking price" value={money(o.listedPrice)} mono />
            {/* Said once: the agreed-price summary below carries it when shown. */}
            <Fact label="Agreed price" value={agreedOn(o) ? null : money(o.agreedPrice)} mono />
            {/* This copy's own cert and your own cost for it. */}
            <Fact label="Your copy" value={text(copy && copy.cert)} mono />
            <Fact label="Your cost" value={money(copy && copy.cost)} mono />
            <Fact label="Last moved" value={day(o.updated)} mono />
            <Fact label="Completed" value={day(o.completedAt)} mono />
          </>
        }
      >
        {fresh.notes[o.id] ? <p className="tps-fresh" role="status">{fresh.notes[o.id]}</p> : null}
        {isUnresolved(o) || isEndedDeal(o) ? (
          <PriceBlock deal={o} me={me} collector={who.get(o.collectorId) || "The collector"} frozen={frozen}
            onCounterOffer={onCounterOffer} onAcceptOffer={onAcceptOffer}
            onDeclineOffer={onDeclineOffer} onRefresh={onRefresh} report={sayAbout(o.id)} note={said[o.id] || null} />
        ) : null}
        {agreedOn(o) ? (
          <div className="tps-agreed" aria-label="Agreed price">
            <p className="tps-agreed-row"><span>Agreed price</span><strong>{dollars(o.agreedPrice)}</strong></p>
            <PriceHistory cls="tps" deal={o} seat={me} other={who.get(o.collectorId) || "The collector"} />
          </div>
        ) : null}
        {(isSelectingStage(o) || valuing) ? (
          <SelectTradePanel deal={o} state={state} me={me} collector={who.get(o.collectorId) || null}
            named={named} ui={selectUi} setUi={setSelectUi} onRefresh={onRefresh} frozen={frozen}
            onSelectTrade={onSelectTrade} onDeselectTrade={onDeselectTrade} onCloseSelection={onCloseSelection} />
        ) : null}
        {said[o.id] && !(isUnresolved(o) || isEndedDeal(o))
          ? <p className="tps-offer-problem tps-offer-said" role="status">{said[o.id]}</p> : null}
        <DealTalk deal={o} state={state} me={me} collector={who.get(o.collectorId) || "the collector"}
          open={!!talking[o.id]} onToggle={() => toggleTalk(o.id)}
          onSendMessage={onSendMessage} onRefresh={onRefresh} />
      </Record>
    );
  };
  /* AN AGREED PRICE (Milestone 2D.3). Until M3A A3 the move after it —
     choosing trade cards — had no control in production, so this screen said
     "Select Trade coming soon" instead of "Your move". A3 ships that control
     (SelectTradePanel, below), so the deal now says its stage and whose move
     it is like any other; the "coming soon" moved one stage on, to Value
     Trade ("Cards held · Value Trade coming soon"). */
  const agreedOn = (o) => isLiveDeal(o) && !isUnresolved(o) && !!dollars(o.agreedPrice);
  /* Whose turn, in two words. Only for live deals; a finished one has none. */
  const turnTag = (o) => {
    if (!isLiveDeal(o) || !o.turn.seat) return null;
    if (me && o.turn.seat === me) return <Tag tone="strong">Your move</Tag>;
    return <Tag>{`Waiting for ${who.get(o.collectorId) || "the collector"}`}</Tag>;
  };

  return (
    <>
      {fresh.failed ? (
        <div className="tps-fresh-fail" role="alert">
          <span>{fresh.ended ? "Your session has ended — sign in again to see the latest."
            : "Couldn't check for updates — what's shown may be out of date. Deal actions are paused until MetYet can confirm the latest."}</span>
          {fresh.ended ? null : <button type="button" className="tps-go quiet" onClick={() => fresh.refreshNow()}>Refresh deals</button>}
        </div>
      ) : null}
      {ready.length || yourMove.length ? (
        <Panel title="Ready to coordinate"
          note={[yourMove.filter((o) => myPriceMove(o, me)).length
            ? plural(yourMove.filter((o) => myPriceMove(o, me)).length, "offer to answer", "offers to answer") : null,
            /* M3A A3: a deal waiting on the shop's choice of cards is not an offer. */
            yourMove.filter((o) => selectMove(o)).length
              ? plural(yourMove.filter((o) => selectMove(o)).length, "deal to choose cards for", "deals to choose cards for") : null,
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
            ? (yourMove.some((o) => myPriceMove(o, me))
              ? "Nothing else in progress — the offers above are waiting on you."
              : "Nothing else in progress — the deals above are waiting on you.")
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
  report = null, note = null, frozen = false }) {
  const sender = useSender(onRefresh, report);
  const [countering, setCountering] = useState(false);
  const myMove = myPriceMove(deal, me);
  const onTable = priceOnTable(deal);
  /* `frozen` (M3A A3): the latest could not be confirmed, so nothing is sent. */
  const busy = !!sender.busy || frozen;
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

/* ------------------------------------------------------------ THE CONVERSATION
   One control that says how many messages there are, and the thread under it.
   Closing it HIDES the thread rather than removing it, so a half-written
   message is still there when it is opened again. */
function DealTalk({ deal, state, me, collector, open, onToggle, onSendMessage, onRefresh }) {
  const count = messagesOf(dealThread(state, deal.id)).length;
  const panel = `tps-talk-${deal.id}`;
  return (
    <div className="tps-talk">
      <button type="button" className="tps-talk-toggle" aria-expanded={open} aria-controls={panel} onClick={onToggle}>
        {open ? "Hide conversation"
          : count ? `Conversation · ${plural(count, "message", "messages")}` : "Conversation"}
      </button>
      <div id={panel} hidden={!open}>
        <DealConversation key={deal.id} cls="tps" deal={deal} state={state} me={me} other={collector}
          onSendMessage={onSendMessage} onRefresh={onRefresh} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ SELECT TRADE
   (M3A A3) The shop chooses which of the Collector's Trade/Sell copies to
   consider for this deal. Everything here follows the server's `turn`:

     select-trade     the shop's first choice. Gathered HERE, on screen, and
                      labelled "Not sent yet" — the server treats the first
                      choice as a message to the Collector, so it goes in ONE
                      send. With nothing chosen, the send asks for more cards.
     more-cards /
     adding-cards     the Collector's move: they add cards or say they're
                      ready. The shop waits; nothing to press.
     close-selection  the Collector is ready. The shop may add a card (sent at
                      once), remove one, and start valuing — after a
                      confirmation, because closing HOLDS every chosen card for
                      this deal alone.

   CHOOSING IS NOT HOLDING. A chosen card can still be chosen in another deal;
   only starting valuation holds it, and the screen says "held" only once the
   server has confirmed that. A close the server refuses names this deal's own
   rows it could not hold (`detail.tradeCardIds`), and those rows say so.

   The draft, the confirmation and the refused rows are kept by Opportunities,
   keyed by deal, so a re-read that moves the deal to another panel keeps them.

   A RE-READ NEVER THROWS AWAY A CHOICE (M3A A3 freshness). An unsent choice
   that is still choosable stays chosen. One that no longer is — held by a
   deal, no longer offered, out of view — stays on screen, marked, from the
   copy as it was when chosen, until the shop removes it; it is never sent and
   never counted. `frozen`: the latest could not be confirmed, so nothing is
   sent until it can. */
function SelectTradePanel({ deal, state, me, collector, named, ui, setUi,
  onSelectTrade, onDeselectTrade, onCloseSelection, onRefresh, frozen = false }) {
  const view = ui[deal.id] || {};
  const put = (patch) => setUi((held) => ({ ...held, [deal.id]: { ...(held[deal.id] || {}), ...patch } }));
  /* What went wrong is reported up to Opportunities' per-deal memory, like
     the price block's: a re-read can move this deal to another panel, which
     remounts this one, and the message must survive the move. */
  const sender = useSender(onRefresh, (key, message) => put({ said: message }), {
    sentence: selectRefusal("tp", collector),
    refreshAlways: true,
    onRefused: (answer) => put({ blocked: answer.detail && Array.isArray(answer.detail.tradeCardIds) ? answer.detail.tradeCardIds : [],
      confirming: false, done: null }),
  });
  const busy = !!sender.busy || frozen;
  const copies = rows(state && state.collectorCopies).filter((b) => b.collectorId === deal.collectorId);
  const copyOf = new Map(copies.map((b) => [b.id, b]));
  const live = liveRows(deal);
  const choosable = byRecency(choosableCopies(deal, copies), "addedAt");
  const chosen = view.draft || [];
  const draft = chosen.filter((id) => choosable.some((b) => b.id === id));
  const lost = chosen.filter((id) => !draft.includes(id));
  const drafted = view.drafted || {};
  const blocked = new Set(view.blocked || []);
  const sending = myMove(deal, me, "select-trade");
  const closing = myMove(deal, me, "close-selection");
  const holding = isValuingStage(deal);
  const reason = turnOf(deal).reason;
  const who = collector || "The collector";

  const say = holding ? "These cards are held for this deal. Value Trade isn't available in MetYet yet."
    : sending ? `Choose the cards you'd consider from ${who}'s Trade/Sell cards. Nothing is sent until you press Send.`
      : closing ? `${who} is ready. Add or remove cards, then start valuing.`
        : reason === "adding-cards" ? `${who} is adding cards. You can finish choosing when they say they're ready.`
          : reason === "more-cards" ? `Waiting for ${who} to add cards or say they're ready.`
            : `Waiting for ${who}.`;

  const toggle = (id) => put(chosen.includes(id)
    ? { draft: chosen.filter((x) => x !== id), done: null, said: null }
    : { draft: [...chosen, id], drafted: { ...drafted, [id]: copyOf.get(id) || null }, done: null, said: null });
  const send = async () => {
    const ids = [...draft];
    if (await sender.send(`select:${deal.id}`, () => onSelectTrade(deal.id, ids))) {
      put({ draft: [], blocked: [], said: null, done: ids.length ? `Sent ${plural(ids.length, "card", "cards")} to ${who}.` : `Asked ${who} for more cards.` });
    }
  };
  const add = async (id) => {
    if (await sender.send(`add:${id}`, () => onSelectTrade(deal.id, [id]))) put({ done: "Added to this deal.", said: null });
  };
  const remove = async (rowId) => {
    if (await sender.send(`remove:${rowId}`, () => onDeselectTrade(deal.id, rowId))) {
      put({ blocked: [...blocked].filter((x) => x !== rowId), done: "Removed from this deal.", said: null });
    }
  };
  const close = async () => {
    const ids = live.map((r) => r.id);
    if (await sender.send(`close:${deal.id}`, () => onCloseSelection(deal.id, ids))) {
      put({ confirming: false, blocked: [], done: "These cards are now held for this deal.", said: null });
    }
  };
  const card = (canonicalCardId) => (canonicalCardId ? named[canonicalCardId] || null : null);
  const n = live.length;

  return (
    <section className="tps-sel" aria-label="Select Trade" data-select={deal.id}>
      <h3 className="tps-sel-h">{holding ? "Cards held for this deal" : "Select Trade"}</h3>
      <p className="tps-sel-say" role="status">{say}</p>

      {live.length ? (
        <>
          <p className="tps-sel-sub">{holding ? "Held for this deal" : "Chosen for this deal"}</p>
          <ul className="tps-sel-list" aria-label="Chosen for this deal">
            {live.map((r) => {
              const copy = copyOf.get(r.binderId) || null;
              const gone = !holding && (blocked.has(r.id) || looksUnavailable(r, copy));
              return (
                <CopyRow key={r.id} cls="tps" row={r} copy={copy} card={card(r.canonicalCardId)}
                  tag={gone ? "No longer available — remove it to continue" : holding ? "Held" : null} warn={gone}>
                  {closing && onDeselectTrade ? (
                    <button type="button" className="tps-go quiet" disabled={busy} onClick={() => remove(r.id)}>
                      {sender.busy === `remove:${r.id}` ? "Removing…" : "Remove"}
                    </button>
                  ) : null}
                </CopyRow>
              );
            })}
          </ul>
        </>
      ) : null}

      {(sending || closing) && !holding ? (
        choosable.length ? (
          <>
            <p className="tps-sel-sub">{`${who}'s Trade/Sell cards`}</p>
            <ul className="tps-sel-list" aria-label={`${who}'s Trade/Sell cards`}>
              {choosable.map((b) => {
                const on = draft.includes(b.id);
                return (
                  <CopyRow key={b.id} cls="tps" copy={b} card={card(b.canonicalCardId)}
                    tag={b.status === "selected" ? "Also chosen in another of your deals" : null}>
                    {sending ? (
                      <button type="button" className={`tps-chip${on ? " on" : ""}`} aria-pressed={on} disabled={busy}
                        onClick={() => toggle(b.id)}>{on ? "Chosen ✓" : "Choose"}</button>
                    ) : onSelectTrade ? (
                      <button type="button" className="tps-go quiet" disabled={busy} onClick={() => add(b.id)}>
                        {sender.busy === `add:${b.id}` ? "Adding…" : "Add to this deal"}
                      </button>
                    ) : null}
                  </CopyRow>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="tps-sel-line">{`${who} has no other Trade/Sell cards to choose from right now.`}</p>
        )
      ) : null}

      {sending && lost.length ? (
        <>
          <p className="tps-sel-sub">No longer available to choose</p>
          <ul className="tps-sel-list" aria-label="No longer available to choose">
            {lost.map((id) => {
              const was = drafted[id] || copyOf.get(id) || { id };
              return (
                <CopyRow key={id} cls="tps" copy={was} card={card(was.canonicalCardId)} warn
                  tag="No longer available to choose — it won't be sent">
                  <button type="button" className="tps-go quiet" disabled={!!sender.busy} onClick={() => toggle(id)}>Remove from my choice</button>
                </CopyRow>
              );
            })}
          </ul>
        </>
      ) : null}

      {sending && onSelectTrade ? (
        <div className="tps-sel-do">
          {draft.length ? <span className="tps-sel-draft">{`${plural(draft.length, "card", "cards")} chosen · Not sent yet`}</span> : null}
          <button type="button" className="tps-go" disabled={busy || (lost.length > 0 && !draft.length)} onClick={send}>
            {sender.busy === `select:${deal.id}` ? "Sending…"
              : draft.length ? `Send ${plural(draft.length, "card", "cards")} to ${who}` : `Ask ${who} for more cards`}
          </button>
        </div>
      ) : null}

      {closing && onCloseSelection && !view.confirming ? (
        <div className="tps-sel-do">
          {n ? (
            <button type="button" className="tps-go" disabled={busy}
              onClick={() => { sender.clear(); put({ confirming: true, done: null, said: null }); }}>
              {`Start valuing ${plural(n, "card", "cards")}`}
            </button>
          ) : <span className="tps-sel-line">Add a card to continue, or ask {who} in the conversation to offer more.</span>}
        </div>
      ) : null}
      {closing && view.confirming ? (
        <div className="tps-sel-confirm" role="group" aria-label="Start valuing">
          <p className="tps-sel-line">
            {`Start valuing ${n === 1 ? "this card" : `these ${n} cards`}? ${n === 1 ? "It'll" : "They'll"} be held for this deal and can't be chosen in another one. ${who} can still take a card out.`}
          </p>
          <div className="tps-sel-do">
            <button type="button" className="tps-go" disabled={busy || !n} onClick={close}>
              {sender.busy === `close:${deal.id}` ? "Starting…" : "Start valuing"}
            </button>
            <button type="button" className="tps-go quiet" disabled={busy} onClick={() => put({ confirming: false })}>Not yet</button>
          </div>
        </div>
      ) : null}

      {sender.trouble || view.said ? <p className="tps-offer-problem" role="status">{sender.trouble || view.said}</p>
        : view.done ? <p className="tps-sel-done" role="status">{view.done}</p> : null}
    </section>
  );
}
