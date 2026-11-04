/* ============================================================================
   DEAL FLOW — ONE CARD PER GOAL, AND WHERE EACH STANDS
   (Milestone 2C.1; organised by the Goal since the true-match batch)

   The landing page is for orientation; the Deal Workspace is for conducting
   the deal. One Goal, one card, one progress bar when a deal is active, one
   next action:

     the card        art, name, set and number, what was asked for, Primary
     who has it      how many Trusted Partners match (partners, not copies)
     where it is     the active deal's stage, its progress bar, its status
     what next       one button: View Deal / Review Counteroffer / View
                     Agreement for an active deal, View Matches otherwise

   PRIMARY GOALS ONLY (Milestone 2C.2, founder decision). Deal Flow is where
   deals are coordinated, and a Secondary Goal says interest, not that: it is
   not drawn, counted or offered here, and stays exactly as it is in Binders
   and Browse, where it can be made Primary.

   NOT AN ACCORDION, AND NOTHING NESTED. No copy rows, prices, inspection,
   photo requests or offer entry on this page. A Goal without a deal shows no
   progress at all — a Goal existing does not mean Market Validation started —
   and a Goal nobody has gets no button rather than a disabled one.

   VIEW MATCHES (`GoalMatches`, below) is the one Goal's matching copies,
   full screen: the Trusted Partners whose copies match, each copy's picture,
   grading, Proposed Market Price and terms, Request actual photos and Make an
   offer. IMAGE FIRST (Milestone 2C.2): there is no Inspect button — the
   picture is what a Collector taps to look, and looking sends nothing. The
   picture is the CATALOGUE's, and says so: it shows the printing, not this
   copy's condition. A copy's own `photos` are the Trusted Partner's (only
   their Add requested photos writes them), but they are references the
   partner typed, not images MetYet holds, and a Collector surface still
   never renders one as a picture (tests/phase4-collector-read-experiences);
   they are said in words. Opening it sends nothing and reserves nothing; an offer
   is sent only by the Collector's own Send. After it is sent, the server's
   next projection names the new deal, and that deal — by the id the server
   gave it, never a guessed one — opens in the Deal Workspace.

   ORGANISED BY THE GOAL, NEVER BY THE PARTNER OR BY WHAT IS NEW. Goals in the
   server's own order; no For You, no New, nothing sorted by price, urgency or
   score. Partners appear in the server's order (`discoveries`, by key), and a
   partner with two matching copies is one Trusted Partner with two rows.

   EVERY COUNT IS THE SERVER'S MATCH. `discoveries` is the server's answer to
   "which available copies, at connected partners, are the exact card in the
   grade and condition asked for" — the same rule for presence and for counts,
   so nothing here broadens or narrows a Goal. An unconnected partner's copy
   never reaches this projection at all.

   ONE ACTIVE DEAL PER GOAL. The domain allows one live offer per exact card;
   a Goal is one exact card, so a live deal under a Goal is that offer, and
   View Matches says why another cannot start. The server remains the
   authority: it refuses a second offer whatever this screen shows.

   WHAT IT SENDS, ONLY THROUGH THE PROPS IT IS HANDED: Request photos and
   opening an offer, from View Matches — and ending an old inspection of a
   copy that is no longer available. (A photo request opens the inspection
   record itself, in the domain, so nothing a Collector needs depends on a
   separate Inspect press.)
   Accept, Counter and Withdraw live in the Deal Workspace (client/collector/
   DealWorkspace.jsx). Whose move it is comes from the server's `turn`; the
   stage and its bar from `deal-progress.js`, through the parts both screens
   share (`deal-parts.jsx`).

   WHAT IT MAY SAY ABOUT A PARTNER'S COPY: the fields of the server's
   allow-list for a Collector — grading, the Proposed Market Price, Open to
   Offers or Firm on Price, and whether photographs exist. Not the certificate
   (P6-F5A doctrine for a partner's copy), and never cost, acquisition date or
   notes, which do not arrive.

   THE EMPTY STATES are still four different silences, said in the network's
   own words (Trusted Partners, never "shops"):

     no Trusted Partners     nobody to have it
     no Goals                nothing asked for
     asked, nobody has it    a true and ordinary answer
     they have the card,     said out loud, because otherwise the screen
     but not as described    looks broken to somebody who can see the card
   ========================================================================== */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSender, statusLine, viewerSeat, isLiveDeal, isEndedDeal } from "../../negotiation.jsx";
import CardArt from "../../card-art.jsx";
import { StateChip } from "../states.jsx";
import { dealGlance, GoalProgress, OpeningOffer } from "../deal-parts.jsx";
import { picturesOf, PhotoViewer } from "../card-viewer.jsx";
import { rows, text, money, plural, gradeLine, gradeProblem, gradeConflictLine,
  criteriaLine, printingLine } from "../present.js";

/* ------------------------------------------------------------ WHAT IS SHOWN
   Pure: the projection in, one entry per Goal out. Exported so the counts can
   be tested without a renderer. */
export function dealFlowGoals(state) {
  const goals = rows(state && state.goals);
  const inventory = rows(state && state.inventory);
  const discoveries = rows(state && state.discoveries);
  const reviews = rows(state && state.copyReviews);
  const requests = rows(state && state.photoRequests);
  const deals = rows(state && state.opportunities);

  const copyById = new Map();
  for (const c of inventory) if (c.invId != null) copyById.set(c.invId, c);
  const openReview = new Set();
  for (const r of reviews) if (!r.endedAt && r.invId != null) openReview.add(r.invId);
  const openRequest = new Set();
  for (const r of requests) if (r.invId != null && !r.fulfilledAt) openRequest.add(r.invId);

  /* This Collector's own deals, by Goal: the live one, or the latest ended. */
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

  const found = new Map();
  for (const d of discoveries) {
    if (d.goalId == null) continue;
    if (!found.has(d.goalId)) found.set(d.goalId, []);
    found.get(d.goalId).push(d);
  }

  return goals.map((goal) => {
    /* Partners in the server's order; a copy the projection did not send is
       not drawn and not counted. */
    const partners = [];
    const byPartner = new Map();
    const matched = new Set();
    for (const d of found.get(goal.id) || []) {
      const copies = rows(d.invIds).map((invId) => copyById.get(invId)).filter(Boolean);
      if (!copies.length || d.partnerId == null) continue;
      let group = byPartner.get(d.partnerId);
      if (!group) { group = { partnerId: d.partnerId, copies: [] }; byPartner.set(d.partnerId, group); partners.push(group); }
      for (const c of copies) { group.copies.push({ copy: c, closed: false }); matched.add(c.invId); }
    }
    const partnerCount = partners.length;
    const copyCount = matched.size;

    /* HELD, NOT MATCHED (Milestone 2C.3 regression fix). A copy of this card
       that this Collector is still inspecting, or asked photos of, but that
       the server does not match to the Goal — gone from the shelf, or there
       in another grade or condition. It stays reachable, so the way to finish
       with it does not vanish, but in its OWN list: never among the matches,
       never counted, never offered. Its records are untouched here. */
    const held = [];
    for (const c of inventory) {
      if (c.canonicalCardId !== goal.canonicalCardId || matched.has(c.invId)) continue;
      if (!openReview.has(c.invId) && !openRequest.has(c.invId)) continue;
      held.push({ copy: c, partnerId: c.partnerId, closed: true });
    }

    /* The card in a form they did not ask for, at a connected partner. */
    const nearMiss = inventory.filter((c) => c.canonicalCardId === goal.canonicalCardId
      && c.archived !== true && c.status === "available" && !matched.has(c.invId)).length;

    const live = liveFor.get(goal.id) || null;
    return {
      goal,
      partners,
      held,
      partnerCount,
      copyCount,
      nearMiss,
      live,
      ended: live ? null : endedFor.get(goal.id) || null,
      liveCopy: live ? copyById.get(live.invId) || null : null,
    };
  });
}


const terms = (copy) => (copy && copy.firmOnPrice === true ? "Firm on Price" : "Open to Offers");

/* The catalogue's name and printing for the cards on screen, asked once. */
function useDescribed(onBrowseCards, ids) {
  const key = [...new Set(ids.filter(Boolean))].join(",");
  const wanted = useMemo(() => key.split(",").filter(Boolean), [key]);
  const [described, setDescribed] = useState({});
  useEffect(() => {
    if (!onBrowseCards || !wanted.length) return undefined;
    let current = true;
    (async () => {
      try {
        const answer = await onBrowseCards.describe(wanted);
        if (!current) return;
        const next = {};
        for (const card of rows(answer && answer.cards)) next[card.canonicalCardId] = card;
        setDescribed((held) => ({ ...held, ...next }));
      } catch (error) { /* a card without a caption is still a card */ }
    })();
    return () => { current = false; };
  }, [key, onBrowseCards]);
  return described;
}

/* Set, number and version (Normal, Reverse Holo …) — see present.js. */
const printingOf = printingLine;
/* Distinct Trusted Partners, never copies: a partner with two matching copies
   is one Trusted Partner who has it. */
const matchLine = (partnerCount) => (partnerCount
  ? plural(partnerCount, "Trusted Partner matches", "Trusted Partners match")
  : "No Trusted Partner matches yet");
const namesOf = (state) => {
  const names = new Map();
  for (const p of rows(state && state.partners)) if (p.id != null) names.set(p.id, text(p.name));
  return (id) => names.get(id) || "A Trusted Partner";
};
const tierChip = (goal) => (goal.tier === "primary"
  ? <StateChip kind="primary" label="Primary Goal" />
  : <StateChip kind="secondary" label="Secondary Goal" />);

/* ============================================================ THE LANDING PAGE */
export default function DealFlow({ state, onBrowseCards = null, onOpenDeal = null, onOpenMatches = null,
  onFindCards = null, focus = null, onFocusUsed = null }) {
  const goals = rows(state && state.goals);
  const partners = rows(state && state.partners);
  const me = viewerSeat(state);
  const nameOf = namesOf(state);
  const shown = dealFlowGoals(state);
  const described = useDescribed(onBrowseCards, goals.map((g) => g.canonicalCardId));

  /* ARRIVING WITH SOMEWHERE TO LAND. From Browse's Open in Deal Flow (P6-F5B),
     the Goal is scrolled into view. Back from the Deal Workspace or View
     Matches, focus also returns to the Goal's button — or to the card, if
     what happened there means it has no button now. Nothing is sent. */
  useEffect(() => {
    if (!focus) return;
    if (typeof document !== "undefined") {
      setTimeout(() => {
        const el = document.querySelector(`[data-goal="${focus.goalId}"]`);
        if (el && el.scrollIntoView) el.scrollIntoView({ block: "start" });
        const to = el ? el.querySelector(".mcs-dg-cta") || el : null;
        if (focus.returnFrom && to && to.focus) to.focus({ preventScroll: true });
      }, 0);
    }
    if (onFocusUsed) onFocusUsed();
  }, [focus]);

  const empty = !partners.length
    ? "You have no Trusted Partners yet. A Trusted Partner invites you, and once you accept they "
      + "can see what you're looking for — and you can see what they have."
    : !goals.length
      ? "You haven't said what you're looking for yet. Find a card in Browse and tell "
        + "MetYet what you want, and any of your Trusted Partners who has one will show up here."
      : null;
  if (empty) return <section className="mcs-dg-sec"><p className="mcs-empty">{empty}</p></section>;

  /* Primary Goals only, in the server's order (see the header). */
  const primary = shown.filter((g) => g.goal.tier === "primary");
  const card = (entry) => (
    <GoalCard key={entry.goal.id} entry={entry} card={described[entry.goal.canonicalCardId] || null}
      me={me} nameOf={nameOf} onOpenDeal={onOpenDeal} onOpenMatches={onOpenMatches} />
  );
  return (
    <>
      <section className="mcs-dg-sec" aria-labelledby="mcs-dg-primary">
        <h2 className="mcs-dg-h2" id="mcs-dg-primary">Primary Goals</h2>
        {primary.length ? <div className="mcs-dg-list">{primary.map(card)}</div> : (
          <div className="mcs-dg-none">
            <p className="mcs-empty">No Primary Goals yet. Make a card Primary when you're ready to make an offer on it.</p>
            {onFindCards ? <button type="button" className="mcs-go" onClick={onFindCards}>Find a card in Browse</button> : null}
          </div>
        )}
      </section>
    </>
  );
}

/* ------------------------------------------------------------ ONE GOAL, ONE CARD
   Identity, who matches, where the one deal stands, one button. No button
   for a Goal with nothing behind one: no deal and nobody who has it. */
function GoalCard({ entry, card, me, nameOf, onOpenDeal, onOpenMatches }) {
  const { goal, partners: groups, held, partnerCount, nearMiss, live, ended } = entry;
  const glance = live ? dealGlance(live, me, nameOf(live.partnerId)) : null;
  const headId = `mcs-dg-${goal.id}`;
  const printing = printingOf(card);
  /* A copy still being inspected that has since stopped matching is listed
     in View Matches — apart from the matches — so the way to finish with it
     stays reachable. */
  const canView = !live && (groups.length > 0 || held.length > 0) && !!onOpenMatches;
  return (
    <article className="mcs-dg" data-goal={goal.id} aria-labelledby={headId} tabIndex={-1}>
      <div className="mcs-dg-top">
        <CardArt src={card && card.imageSmall} name={card && card.cardName}
          wrap="mcs-dg-art" plate="mcs-art-plate" decorative />
        <div className="mcs-dg-id">
          <h3 className="mcs-dg-name" id={headId}>{(card && card.cardName) || "Loading this card…"}</h3>
          {printing ? <p className="mcs-dg-set">{printing}</p> : null}
          <p className="mcs-dg-want">{criteriaLine(goal.desired) || "Any grade or condition"}</p>
          <span className="mcs-dg-marks">{tierChip(goal)}</span>
        </div>
      </div>
      <p className={`mcs-dg-match${partnerCount ? "" : " none"}`}>{matchLine(partnerCount)}</p>
      {!partnerCount && nearMiss > 0 ? (
        <p className="mcs-dg-near">Your Trusted Partners have this card in another grade or condition.</p>
      ) : null}
      {live ? (
        <div className="mcs-dg-deal" data-opp={live.id}>
          <GoalProgress deal={live} glance={glance} />
          {onOpenDeal ? (
            <button type="button" className={`mcs-go mcs-dg-cta${glance && glance.mine ? " mine" : ""}`}
              onClick={() => onOpenDeal(live.id, live.goalId)}>
              {glance ? glance.cta : "View Deal"}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {ended ? <p className="mcs-dg-ended">{statusLine(ended, me, nameOf(ended.partnerId))}</p> : null}
          {canView ? (
            <button type="button" className="mcs-go mcs-dg-cta" data-matches={goal.id}
              onClick={() => onOpenMatches(goal.id)}>View Matches</button>
          ) : null}
        </>
      )}
    </article>
  );
}

/* ============================================================ VIEW MATCHES
   One Goal's matching copies, full screen, in place of the whole Collector
   screen as the Deal Workspace is. The Goal is looked up among this
   Collector's own (`state.goals` holds nothing else); one that is not there
   is said to be unavailable. Opening it sends nothing. */
export function GoalMatches({ state, goalId, compose = null, onBack = null, onBrowseCards = null,
  onEndInspection = null, onRequestPhotos = null, onOpenOffer = null,
  onOpenDeal = null, onRefresh = null }) {
  const me = viewerSeat(state);
  const nameOf = namesOf(state);
  const entry = dealFlowGoals(state).find((g) => g.goal.id === goalId) || null;
  const reviews = rows(state && state.copyReviews);
  const requests = rows(state && state.photoRequests);

  const openReview = new Map();
  for (const r of reviews) if (!r.endedAt && r.invId != null) openReview.set(r.invId, r);
  const openRequest = new Set();
  for (const r of requests) if (r.invId != null && !r.fulfilledAt) openRequest.add(r.invId);

  /* ONE PRESS PER CONTROL, NOT ONE PER SCREEN: two copies are two independent
     things to ask about, and a press on one never swallows a press on another. */
  const [busy, setBusy] = useState({});
  const [trouble, setTrouble] = useState(null);
  const run = async (key, invId, send, verb) => {
    if (!send || busy[key]) return;
    setBusy((held) => ({ ...held, [key]: true }));
    setTrouble((held) => (held && held.invId === invId ? null : held));
    try {
      const answer = await send();
      if (answer && answer.ok === false) {
        setTrouble({ invId, message: answer.refused === "copy-unavailable"
          ? "That copy isn't available any more."
          : `Couldn't ${verb} just now.` });
      }
    } catch (error) {
      setTrouble({ invId, message: `Couldn't ${verb} just now.` });
    } finally {
      setBusy((held) => { const next = { ...held }; delete next[key]; return next; });
    }
  };

  /* One offer composer at a time, on the copy it is for — open on arrival
     only when the Collector came here by pressing Make an Offer in Browse
     (`compose` is the copy Browse named). */
  const [composing, setComposing] = useState(compose && compose.invId ? compose.invId : null);
  const [offerSaid, setOfferSaid] = useState(null);
  const offer = useSender(onRefresh, (key, message) => setOfferSaid(message ? { key, message } : null));

  /* AFTER AN OFFER, THE DEAL IT MADE. Not guessed: the server's next
     projection names the Goal's live deal, and that id is what opens. */
  const [sent, setSent] = useState(false);
  const liveId = entry && entry.live ? entry.live.id : null;
  useEffect(() => {
    if (sent && liveId && onOpenDeal) onOpenDeal(liveId, goalId);
  }, [sent, liveId]);

  const cardId = entry ? entry.goal.canonicalCardId : null;
  const card = useDescribed(onBrowseCards, [cardId])[cardId] || null;

  /* THE PHOTO VIEWER: which copy's pictures are open, if any. Closing puts
     focus back on that copy's picture, so the Collector is where they were. */
  const [viewing, setViewing] = useState(null);
  const thumbs = useRef({});
  const closeViewer = () => {
    const was = viewing;
    setViewing(null);
    const el = was ? thumbs.current[was] : null;
    if (el && el.focus) setTimeout(() => el.focus(), 0);
  };

  /* Arriving starts at the top, with focus on the title — unless they came
     to make an offer, when the composer they asked for keeps it. */
  const titleRef = useRef(null);
  useEffect(() => {
    if (typeof window !== "undefined" && window.scrollTo) window.scrollTo(0, 0);
    if (!compose && titleRef.current && titleRef.current.focus) titleRef.current.focus({ preventScroll: true });
  }, [goalId]);

  const back = onBack ? (
    <button type="button" className="mcs-ws-back" onClick={onBack} aria-label="Back to Deal Flow">
      <span aria-hidden="true" className="mcs-ws-arrow" />
    </button>
  ) : null;

  if (!entry) {
    return (
      <div className="mcs-ws mcs-gm">
        <header className="mcs-ws-hd">
          <div className="mcs-ws-top">
            {back}
            <h1 className="mcs-ws-title" tabIndex={-1} ref={titleRef}>Goal not available</h1>
          </div>
        </header>
        <div className="mcs-ws-body">
          <p className="mcs-ws-note">This Goal isn't available. It may have been removed. Nothing has been changed.</p>
          {onBack ? <button type="button" className="mcs-go" onClick={onBack}>Back to Deal Flow</button> : null}
        </div>
      </div>
    );
  }

  const { goal, partners: groups, held, partnerCount, nearMiss, live, ended } = entry;
  const isPrimary = goal.tier === "primary";
  const canOffer = !!onOpenOffer && isPrimary && !live;
  const livePartner = live ? nameOf(live.partnerId) : null;

  /* One copy's row — in the matches, or (closed) among the copies held
     from before. */
  const drawCopy = (group) => ({ copy, closed }) => {
                const conflict = gradeProblem(copy) ? gradeConflictLine(copy) : null;
                const looking = openReview.get(copy.invId) || null;
                const asked = openRequest.has(copy.invId);
                const pics = picturesOf(copy, card);
                const photographed = !!(copy.photos && copy.photos.front && copy.photos.back);
                const inDeal = !!live && live.invId === copy.invId;
                const canAsk = !closed && !photographed && !asked && !!onRequestPhotos;
                return (
                  <li key={copy.invId} className={`mcs-df-copy${inDeal ? " in-deal" : ""}`} data-inv={copy.invId}>
                    <button type="button" className="mcs-pv-thumb" ref={(el) => { thumbs.current[copy.invId] = el; }}
                      aria-label={`Look at this copy: ${pics.catalog ? "catalog image" : "no picture yet"}${pics.sides ? `, partner photos: ${pics.sides}` : ""}`}
                      onClick={() => setViewing(copy.invId)}>
                      <CardArt src={card && card.imageSmall} name={card && card.cardName}
                        wrap="mcs-pv-art" plate="mcs-art-plate" decorative />
                      <span className="mcs-pv-tag">{pics.catalog ? "Catalog" : "No picture"}</span>
                    </button>
                    <span className="mcs-df-facts">
                      <span className="mcs-df-grade">{gradeLine(copy) || "Grade not stated"}</span>
                      <span className="mcs-df-terms">{terms(copy)}</span>
                      <span className="mcs-df-photo">{pics.sides ? `Partner photos: ${pics.sides}`
                        : asked ? "Photos requested" : "No photos yet"}</span>
                    </span>
                    <span className="mcs-df-price">
                      <span className="mcs-df-ask">{money(copy.ask) || "No price yet"}</span>
                      <span className="mcs-df-pl">Proposed Market Price</span>
                    </span>
                    {conflict ? <span className="mcs-df-note">{conflict}</span> : null}

                    <span className="mcs-df-do">
                      {inDeal ? <span className="mcs-df-state">In your active deal</span> : null}
                      {/* Kept on the list only because an old inspection or a photo
                          request holds it: say which is true — the copy left the
                          partner's shelf, or it is there but no longer matches. */}
                      {closed ? <span className="mcs-df-state">{`${nameOf(group.partnerId)} · ${copy.status === "available"
                        ? "No longer matches your Goal" : "No longer available"}`}</span> : null}
                      {trouble && trouble.invId === copy.invId
                        ? <span className="mcs-df-trouble" role="status">{trouble.message}</span>
                        : null}
                      {canOffer && !closed && !sent && composing !== copy.invId ? (
                        <button type="button" className="mcs-go mcs-go-primary"
                          disabled={!!offer.busy}
                          onClick={() => { offer.clear(); setOfferSaid(null); setComposing(copy.invId); }}>
                          Make an offer
                        </button>
                      ) : null}
                      {canAsk ? (
                        <button type="button" className="mcs-go quiet"
                          disabled={!!busy[`ask:${copy.invId}`]}
                          onClick={() => run(`ask:${copy.invId}`, copy.invId,
                            () => onRequestPhotos(copy.invId), "ask for photos")}>
                          Request actual photos
                        </button>
                      ) : null}
                      {/* An inspection begun before Milestone 2C.2, on a copy that has
                          since stopped being available: the one way to put it down.
                          Offered only when it is TRUE — with a photo request still
                          open, ending the inspection would not take the copy off
                          this list (the request keeps it here, and the domain has
                          no way to withdraw a request), so it is not offered. */}
                      {closed && looking && !asked && onEndInspection ? (
                        <button type="button" className="mcs-go quiet"
                          disabled={!!busy[`end:${copy.invId}`]}
                          onClick={() => run(`end:${copy.invId}`, copy.invId,
                            () => onEndInspection(looking.id), "remove that")}>
                          Remove from list
                        </button>
                      ) : null}
                    </span>
                    {canOffer && !closed && !sent && composing === copy.invId ? (
                      <OpeningOffer busy={!!offer.busy} partner={nameOf(group.partnerId)}
                        listed={typeof copy.ask === "number" && copy.ask > 0 ? copy.ask : null}
                        firm={copy.firmOnPrice === true}
                        onCancel={() => { offer.clear(); setOfferSaid(null); setComposing(null); }}
                        onSubmit={async (price) => {
                          const ok = await offer.send(`open:${goal.id}:${copy.invId}`,
                            () => onOpenOffer(goal.id, copy.invId, price));
                          if (ok) { setComposing(null); setSent(true); }
                        }} />
                    ) : null}
                    {viewing === copy.invId ? (
                      <PhotoViewer id={copy.invId} pics={pics} card={card} copy={copy} partner={nameOf(group.partnerId)}
                        asked={asked} canAsk={canAsk} busy={!!busy[`ask:${copy.invId}`]}
                        onRequest={() => run(`ask:${copy.invId}`, copy.invId, () => onRequestPhotos(copy.invId), "ask for photos")}
                        onClose={closeViewer} />
                    ) : null}
                  </li>
                );
  };

  return (
    <div className="mcs-ws mcs-gm" data-goal={goal.id}>
      <header className="mcs-ws-hd">
        <div className="mcs-ws-top">
          {back}
          <CardArt src={card && card.imageSmall} name={card && card.cardName}
            wrap="mcs-ws-art" plate="mcs-art-plate" decorative />
          <div className="mcs-ws-id">
            <h1 className="mcs-ws-title" tabIndex={-1} ref={titleRef}>{(card && card.cardName) || "Your Goal"}</h1>
            <p className="mcs-ws-sub">{[printingOf(card), criteriaLine(goal.desired) || "Any grade or condition"]
              .filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <p className="mcs-gm-sum">{tierChip(goal)}<span>{matchLine(partnerCount)}</span></p>
      </header>

      <div className="mcs-ws-body">
        {live ? (
          <p className="mcs-ws-say">
            {`You have an active deal for this card with ${livePartner}. One deal at a time per Goal, `
              + "so another offer can't start while it's active."}
          </p>
        ) : ended ? <p className="mcs-ws-say">{statusLine(ended, me, nameOf(ended.partnerId))}</p> : null}
        {!isPrimary ? (
          <p className="mcs-ws-say">This is a Secondary Goal. You can look at copies and ask for photos; offers start from a Primary Goal.</p>
        ) : null}
        {offerSaid && offerSaid.key.startsWith(`open:${goal.id}:`) ? (
          <p className="mcs-df-trouble" role="status">{offerSaid.message}</p>
        ) : null}
        {sent && !live ? <p className="mcs-ws-say" role="status">Offer sent. Opening your deal…</p> : null}

        {groups.length === 0 ? (
          <p className="mcs-ws-note">
            {nearMiss > 0
              ? `No copies match what you asked for — though ${plural(nearMiss, "copy", "copies")} `
                + `of this card ${nearMiss === 1 ? "is" : "are"} available from your Trusted Partners `
                + "in a different grade or condition."
              : "None of your Trusted Partners has this one right now."}
          </p>
        ) : groups.map((group) => (
          <section key={group.partnerId} className="mcs-gm-partner" data-partner={group.partnerId}
            aria-label={nameOf(group.partnerId)}>
            <h2 className="mcs-gm-pname">
              <span>{nameOf(group.partnerId)}</span>
              {live && live.partnerId === group.partnerId ? <span className="mcs-dg-tag">Active deal</span> : null}
            </h2>
            <ul className="mcs-df-copies">
              {group.copies.map(drawCopy(group))}
            </ul>
          </section>
        ))}

        {/* HELD, NOT MATCHED: copies of this card kept only because of an old
            inspection or a photo request. Apart from the matches, below them,
            never counted or offered (Milestone 2C.3 regression fix). */}
        {held.length ? (
          <section className="mcs-gm-held" aria-labelledby={`mcs-gm-held-${goal.id}`}>
            <h2 className="mcs-ws-h2" id={`mcs-gm-held-${goal.id}`}>Copies you looked at before</h2>
            <p className="mcs-ws-note">These don't match this Goal now. They're kept here because you inspected them or asked for photos.</p>
            <ul className="mcs-df-copies">
              {held.map((h) => drawCopy({ partnerId: h.partnerId })(h))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

