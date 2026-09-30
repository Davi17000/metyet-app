/* ============================================================================
   THE COLLECTION — THE CARDS THAT ALREADY MEAN SOMETHING TO YOU

   THIS FILE WAS TRADE BINDER, THEN YOUR CARDS, AND IS NOW NEITHER A BINDER NOR
   A DESTINATION. C2 renamed it from Trade Binder because owning and offering
   had stopped being one fact. C3.4 made it reachable. This batch moves the job
   it did into Binders and takes the tab away — so what is left is a COMPONENT
   that Binders composes, once per view, rather than a screen of its own. One
   concept, one file, a third name, and the same rule as the last two renames:
   deferring or absorbing a section must never quietly become deleting it.

   WHAT IT RENDERS, FOR EVERY VIEW. A list of canonical cards, each with its
   picture and its identity, and underneath it the physical copies the Collector
   owns of that card. Which cards, and which of their copies, is the `view`
   prop's business and nothing else changes.

     all         every card that already means something: filed in a binder,
                 wanted as a Goal, or owned. The union, de-duplicated by card.
     primary     the cards with a Primary Goal
     secondary   the cards with a Secondary Goal
     trade       the cards with at least one copy the Collector is OFFERING —
                 and under them, only those copies
     binder      the cards filed in one named binder

   NONE OF THESE IS A BINDER. They are computed on every render from rows the
   server already sent, and nothing about them is stored: no synthetic binder,
   no saved filter, no cached membership. File a card and it appears in `all` on
   the next authoritative refresh; stop offering a copy and it leaves `trade`.

   CARD FIRST, COPIES SECOND (Phase 5 C3.4). The durable model is copy-based and
   stays that way: every physical card is its own row with its own certificate,
   its own grading, its own reference value and its own `offered`. But a person
   looks for THE CHARIZARD and then works out which one, so the card is the
   heading and the copies sit under it.

   THE GROUP IS A HEADING, NOT A RECORD. It carries the card's identity — the
   picture, the name, the set and number — and nothing that would need to be
   averaged. In particular it NEVER shows a grade: somebody holding a PSA 9 and
   a damaged raw copy of one card owns two very different objects, and any
   single grading for the pair would be a fact about neither.

   OWNING, OFFERING, KEEPING AND WANTING ARE FOUR FACTS, AND STAY FOUR.
   `offered` says whether your Trusted Partners can see a copy as something you
   would trade; `keeping` says its owner has decided to hold on to it. They
   contradict each other and the domain keeps them apart, but NEITHER is the
   other's absence: a card can be yours with nothing said about it at all, and
   withdrawing an offer does not remove the card or make it a keeper. A Goal for
   a card you already own is not a contradiction either — it is somebody hunting
   a better copy — so the group says so quietly. Nothing here collapses them
   into a status, and `offered === false` is NOT read as any kind of positive
   "keeping this" statement: it is the absence of an offer, which is all
   anybody has actually said, and `keeping` is where the other statement lives.

   THE STATUS IS THE SERVER'S ANSWER, carried on the row. Available, reserved,
   committed, traded — derived from every opportunity under the domain's rules,
   and read here as `copy.status`. This file does not look at opportunities and
   work it out: a second implementation of a rule is a second answer to it.

   NO PICTURES OF YOUR OWN COPY, HONESTLY. `photos` holds references like
   `binder:t15:front`, not URLs — the product does not serve a Collector's own
   photographs yet. So a copy says in words whether it has pictures. The picture
   on the group is the CATALOGUE's image of the card, which is a different thing
   and is not a photograph of anybody's copy.
   ========================================================================== */

import React, { useEffect, useMemo, useState } from "react";
import { useCardDescriptions } from "../card-descriptions.js";
import { Panel, Record, Fact, Tag } from "../parts.jsx";
import CardArt from "../../card-art.jsx";
import CardSpecification from "../CardSpecification.jsx";
import { rows, indexById, text, day, money, plural, cardTitle, cardSetLine,
  gradeLine, isGraded, gradeConflictLine, cardMarks, statusLabel, photoNote,
  tierIntent, tierLabel, byRecency } from "../present.js";

/* The four collection views, named once. Binders reads this to build its own
   selector, so the two cannot disagree about what exists.

   THERE IS STILL NO "PC" VIEW HERE, AND THAT IS NOW A CHOICE RATHER THAN A
   LIMIT. A Personal Collection has a fact of its own at last — `keeping`, a
   positive statement with its own command — so a sixth tab is finally possible.
   It is not added here because nobody has asked for one: this batch was asked
   to make the four states sayable and truthful, and a view is a different
   question about how somebody wants to browse what they own. What `keeping`
   does get is the thing it could not have before — a copy that says so on its
   own row, in its own words, instead of hiding inside "Not offered". */
export const COLLECTION_VIEWS = Object.freeze([
  /* MY BINDERS IS FIRST AND IS THE DEFAULT, because a tab called Binders should
     open on binders. It is not a collection view — selecting it shows the
     library instead of a card list — but it belongs in the same row, because
     these are five answers to one question: which of my cards am I looking at?

     THEY ARE MUTUALLY EXCLUSIVE ON PURPOSE. Stacking a card list above the
     binder library put ownership counts on the library screen, and this file's
     neighbour has held since C3.4 that a binder is curation and must not
     quietly become inventory. One screen, one question. */
  { id: "binders", label: "My Binders" },
  { id: "all", label: "All Cards" },
  { id: "primary", label: "Primary Goals" },
  { id: "secondary", label: "Secondary Goals" },
  { id: "trade", label: "Trade/Sell" },
]);

/* THE GROUP KEY, AND WHY NOTHING IS ALLOWED TO FALL OUT OF IT.

   Three kinds of row arrive here and each names its card differently: a
   canonical id, a legacy `cardId` from before canonical identity existed, or —
   for a copy somebody recorded before saying what it is — neither. The first
   two get a key of their own. The third USED to return null and be dropped,
   which meant an owned copy the Collector was actively OFFERING vanished from
   every view while Trusted Partners could still see it, and Trade/Sell printed
   "you're not offering any of your cards" over the top of a live offer. A
   screen that quietly omits a row is worse than one that admits it is missing
   something, so an unidentified copy is now grouped under its own id and says
   what it is.

   Every key is a STRING. Ids are the server's and it has never promised they
   are text; `k.startsWith(...)` on a numeric one threw and took the whole
   section white, so they are coerced once, here, rather than trusted at each
   of the four places that test a prefix. */
const idText = (value) => (value == null ? "" : String(value));
const groupIdOf = (canonicalCardId, cardId, copyId) => {
  const canonical = idText(canonicalCardId);
  if (canonical) return canonical;
  const legacy = idText(cardId);
  if (legacy) return `legacy:${legacy}`;
  const own = idText(copyId);
  return own ? `copy:${own}` : null;
};
const isLegacy = (key) => key.startsWith("legacy:");
const isUnidentified = (key) => key.startsWith("copy:");
const isCanonical = (key) => !isLegacy(key) && !isUnidentified(key);

export default function Collection({ state, view = { kind: "all" }, query = "",
  onBrowseCards = null, onSpecify = null, descriptions = null }) {
  const copies = rows(state && state.collectorCopies);
  const goals = rows(state && state.goals);
  const entries = rows(state && state.binderEntries);
  const catalog = indexById(state && state.catalog);
  /* `interests` AND THE PARTNER-NAME INDEX ARE GONE FROM THIS FILE. They
     existed only for the "Interested · <shop>" line removed below, which read
     rows no exposed command can create. The durable concept is untouched. */
  const goalFor = new Map();
  for (const g of goals) {
    const groupId = groupIdOf(g.canonicalCardId, g.cardId, null);
    if (groupId) goalFor.set(groupId, g);
  }

  const [specifying, setSpecifying] = useState(null);

  /* EVERY COPY THE COLLECTOR OWNS, INDEXED BY ITS CARD. Built once and used by
     every view, so "which copies are under this card" is answered in one place
     whether the card arrived from a binder, a goal or the shelf. */
  const copiesOfCard = useMemo(() => {
    const out = new Map();
    for (const copy of byRecency(copies, "addedAt")) {
      const groupId = groupIdOf(copy.canonicalCardId, copy.cardId, copy.id);
      if (!groupId) continue;
      const held = out.get(groupId);
      if (held) held.push(copy);
      else out.set(groupId, [copy]);
    }
    return out;
  }, [copies]);

  /* WHICH CARDS THIS VIEW IS ABOUT. Each branch is a filter over rows the
     server sent; none of them consults another, and none is stored. */
  const cardKeys = useMemo(() => {
    const kind = (view && view.kind) || "all";
    if (kind === "binder") {
      const binderId = view && view.binderId;
      return entries.filter((e) => e.binderId === binderId)
        .map((e) => groupIdOf(e.canonicalCardId, e.cardId, null)).filter(Boolean);
    }
    if (kind === "primary" || kind === "secondary") {
      /* A GOAL NAMED THE LEGACY WAY IS STILL A GOAL. These branches used to
         require `canonicalCardId`, so a goal carrying the older `cardId` was
         absent from its own tier AND from All Cards — with Goals deferred as a
         destination this batch, that left it no reachable home on the whole
         Collector. Wanting a card is one of the four truths; how the row spells
         the card is not a reason to stop showing that somebody wants it. */
      return goals.filter((g) => g.tier === kind)
        .map((g) => groupIdOf(g.canonicalCardId, g.cardId, null)).filter(Boolean);
    }
    if (kind === "trade") {
      /* COPY-LEVEL, GROUPED FOR READING ONLY. A card is here because one of its
         copies is offered; the copies listed under it are only the offered
         ones, so a person holding two and offering one sees exactly one. */
      const offered = copies.filter((c) => c.offered === true);
      return [...new Set(offered.map((c) => groupIdOf(c.canonicalCardId, c.cardId, c.id))
        .filter(Boolean))];
    }
    /* ALL CARDS — the union of the three places a card can already mean
       something, de-duplicated by card identity. Not the catalogue, and not a
       search: a card nobody has filed, wanted or recorded is not in it.

       MEMBERSHIP OF AN ARCHIVED BINDER STILL COUNTS. Archiving a binder puts it
       away; it does not un-file what is in it, and the card is still one the
       Collector has handled. The library's "Not in a binder yet" list asks a
       narrower question — is this card in a binder you are still USING — so a
       card whose only binder is archived appears in All Cards and is also
       offered a home on the library. Both statements are true and they are
       answers to different questions; neither is a membership rule. */
    return [
      ...entries.map((e) => groupIdOf(e.canonicalCardId, e.cardId, null)),
      ...goals.map((g) => groupIdOf(g.canonicalCardId, g.cardId, null)),
      ...copies.map((c) => groupIdOf(c.canonicalCardId, c.cardId, c.id)),
    ].filter(Boolean);
  }, [view && view.kind, view && view.binderId, entries, goals, copies]);

  /* MOST RECENT FIRST — THE ORDER IS THE COLLECTOR'S, NOT THIS SCREEN'S.

     Your Cards held since C3.4 that "order is the copies' own — most recently
     added card first — so the screen does not invent a ranking", and enforced
     it with `byRecency` over the groups. Composing the views lost it: the keys
     came out in whatever order the three arrays happened to be in, which put
     the OLDEST card at the top — exactly backwards, and a ranking invented by
     array order rather than by anything the Collector did.

     A card can be reached by three different rows with three different dates,
     so its place is the most recent thing that happened to it: a copy added, a
     goal set, a card filed. Cards with no date at all sort last, in the order
     they arrived, which is `byRecency`'s own rule. */
  const touchedAt = useMemo(() => {
    const out = new Map();
    const mark = (groupId, when) => {
      if (!groupId || !when) return;
      const held = out.get(groupId);
      if (!held || held < when) out.set(groupId, when);
    };
    for (const e of entries) mark(groupIdOf(e.canonicalCardId, e.cardId, null), e.addedAt);
    for (const g of goals) {
      mark(groupIdOf(g.canonicalCardId, g.cardId, null), g.secondarySince || g.createdAt);
    }
    for (const c of copies) mark(groupIdOf(c.canonicalCardId, c.cardId, c.id), c.addedAt);
    return out;
  }, [entries, goals, copies]);

  const ordered = useMemo(() => {
    const unique = [...new Set(cardKeys)];
    return byRecency(unique.map((key) => ({ key, at: touchedAt.get(key) || null })), "at")
      .map((row) => row.key);
  }, [cardKeys.join(","), touchedAt]);

  /* ONE REQUEST FOR THE IDS THIS VIEW HOLDS (C3.4), the same way Goals has
     asked since Batch 7. Never one per row, never the legacy catalogue, and a
     card whose description has not arrived still renders — it still means
     something to somebody. */
  const canonicalIds = useMemo(() => ordered.filter(isCanonical), [ordered.join(",")]);
  /* ONE CACHE FOR THE WHOLE SCREEN. When Binders composes this component it
     hands its own down, so moving between the five views re-uses what has
     already arrived instead of buying it again on every chip press. Rendered on
     its own — which is how the tests drive it — it keeps one of its own. */
  const own = useCardDescriptions(descriptions ? null : onBrowseCards);
  const { described, describe } = descriptions || own;
  useEffect(() => { describe(canonicalIds); }, [canonicalIds.join(","), describe]);

  /* SEARCH ACROSS WHAT IS ALREADY MEANINGFUL — never the catalogue.

     It reads the descriptions this view already fetched plus the legacy row's
     own fields, and it matches on plain lowercase substring. There is no
     ranking, no fuzziness, no second server query and nothing stored: clear the
     box and the view is exactly what it was. A card whose caption has not
     arrived cannot be matched by name, which is honest — the alternative would
     be asking the catalogue, and that is Browse's job, not this one. */
  const needle = text(query) ? text(query).toLowerCase() : null;
  const matches = (key) => {
    if (!needle) return true;
    const known = described[key];
    const legacy = isLegacy(key) ? catalog.get(key.slice(7)) : null;
    const hay = [
      known && known.cardName, known && known.expansionName,
      known && known.collectorNumber && `#${known.collectorNumber}`,
      legacy && legacy.name, legacy && legacy.set, legacy && legacy.num,
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(needle);
  };

  const shown = ordered.filter(matches);
  const kind = (view && view.kind) || "all";
  const tradeView = kind === "trade";
  /* A BINDER SHOWS CARDS, NOT INVENTORY. Binder.jsx has held since C3.4 that a
     binder says "this card belongs here" and must not quietly become a shelf:
     how many copies you have, and which you would part with, is a different
     fact and a count of it here would turn curation into inventory one number
     at a time. That principle survives this batch intact — the collection views
     are where the shelf lives now, and a named binder is not one of them. */
  const withCopies = kind !== "binder";

  /* HOW MUCH OF THE SHELF IS ON OFFER. Your Cards said this next to its
     "Offered only" toggle, and the toggle becoming a view chip is not a reason
     to stop saying it: "you're offering 2 of 11" is the fact that tells a
     person whether this short list is the whole story. Counted over copies, not
     cards, because offering is a copy's fact. */
  const offeredCount = copies.filter((c) => c.offered === true).length;
  const note = tradeView && copies.length
    ? (offeredCount === 0
      ? "You're not offering any of your copies yet."
      : `You're offering ${offeredCount} of ${plural(copies.length, "copy", "copies")}.`)
    : shown.length ? plural(shown.length, "card", "cards") : null;

  const empty = ordered.length === 0
    ? EMPTY_FOR[(view && view.kind) || "all"] || EMPTY_FOR.all
    : shown.length === 0
      ? `Nothing here matches “${text(query)}”.`
      : null;

  return (
    <Panel
      title={TITLE_FOR[(view && view.kind) || "all"] || TITLE_FOR.all}
      note={note}
      empty={empty}
    >
      {specifying ? (
        <div className="mcs-spec-scrim">
          <CardSpecification card={specifying} context={specifying} state={state}
            onCommit={onSpecify} onClose={() => setSpecifying(null)} />
        </div>
      ) : null}

      {shown.map((key) => {
        const known = described[key] || null;
        const legacy = isLegacy(key) ? catalog.get(key.slice(7)) : null;
        const goal = goalFor.get(key) || null;
        const mine = copiesOfCard.get(key) || [];
        const listed = !withCopies ? []
          : tradeView ? mine.filter((c) => c.offered === true) : mine;
        const title = (known && known.cardName) || cardTitle(legacy)
          || (isUnidentified(key) ? "A copy you haven't identified yet"
            : isLegacy(key) ? "A card that isn't in your catalogue"
              : "Loading this card…");
        const sub = known
          ? [text(known.expansionName), known.collectorNumber ? `#${known.collectorNumber}` : null]
            .filter(Boolean).join(" · ") || null
          : cardSetLine(legacy);
        const marks = known
          ? [known.printRun, known.finish, known.language].filter(Boolean)
          : cardMarks(legacy);
        /* Only a canonical card can be specified: the panel writes facts about
           an id the server minted, and a legacy row has none. */
        const open = onSpecify && known ? () => setSpecifying(known) : null;

        return (
          <article className="mcs-group" key={key}>
            <div className="mcs-group-head">
              <CardArt src={known && known.imageSmall} name={known && known.cardName}
                wrap="mcs-group-art" plate="mcs-art-plate" decorative />
              <div className="mcs-rec-id">
                <div className="mcs-rec-t">{title}</div>
                {sub ? <div className="mcs-rec-s">{sub}</div> : null}
                {marks.length ? (
                  <div className="mcs-marks">
                    {marks.map((m) => <span key={m} className="mcs-mark">{m}</span>)}
                  </div>
                ) : null}
                <div className="mcs-rec-tags">
                  {listed.length ? (
                    <Tag>{plural(listed.length, "copy", "copies")}</Tag>
                  ) : null}
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
            {listed.map((copy) => {
              const graded = isGraded(copy);
              const conflict = gradeConflictLine(copy);
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
                      {/* OWNING IS THE ROW; WHAT THE PERSON SAID ABOUT THIS
                          COPY IS THIS TAG, AND THERE ARE THREE ANSWERS.

                          It used to read "Offered" or "Not offered", which was
                          the whole conflation this batch exists to end: it
                          showed a copy somebody had deliberately marked
                          Personal Collection in the same words as one they have
                          simply never mentioned. Now the two statements say
                          themselves and silence says nothing — no tag, because
                          "hasn't decided" is not a decision to display. */}
                      {copy.offered === true
                        ? <Tag tone="strong">Offered</Tag>
                        : copy.keeping === true
                          ? <Tag tone="strong">Keeping</Tag>
                          : null}
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
                  {/* "INTERESTED · <shop>" USED TO RENDER HERE, AND IT COULD
                      NEVER SAY ANYTHING.

                      An `interest` is a Trusted Partner's statement that they
                      would consider one of your copies, and the only command
                      that writes one — `setInterest` — is not on the production
                      surface. So this line read from rows production cannot
                      produce: a permanently empty branch that promised a fact
                      the product cannot yet carry, and invited a question
                      nobody could answer.

                      REMOVED, NOT EXPOSED. Opening `setInterest` would be
                      designing partner interest, which is a product decision
                      nobody has made; the durable concept, its command, its
                      projection and its tests are all untouched and ready for
                      the batch that gives it a surface. What is gone is only
                      the claim that it already has one. */}
                </Record>
              );
            })}
          </article>
        );
      })}
    </Panel>
  );
}

const TITLE_FOR = Object.freeze({
  all: "All cards",
  primary: "Actively hunting",
  secondary: "Keeping an eye out",
  trade: "Offering to trade or sell",
  binder: "In this binder",
});

const EMPTY_FOR = Object.freeze({
  all: "Nothing has meaning yet. Find a card in Browse and file it, say you want it, or "
    + "record one you already own — whichever is true.",
  primary: "You aren't actively hunting anything. A Primary Goal is a card you're "
    + "chasing now; your Trusted Partners work from it.",
  secondary: "Nothing on your watchlist. A Secondary Goal is a card you're keeping an "
    + "eye out for rather than chasing.",
  /* COPIES, NOT CARDS. This view filters `copy.offered === true`, so what is or
     is not being offered is a physical object; two lines up the panel note
     already said "copies" correctly and these two disagreed. */
  trade: "You're not offering any of your copies right now. Offering one is a separate "
    + "choice from owning it — your Trusted Partners see only what you offer.",
  binder: "Nothing in this binder yet. A binder is where a card belongs — it doesn't mean "
    + "you want it or own it.",
});
