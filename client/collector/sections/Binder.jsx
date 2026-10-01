/* ============================================================================
   BINDER — WHERE A CARD BELONGS (Phase 5 C3.4)

   A Collector's own named groupings of canonical cards. C3.1 built the concept
   and deliberately shipped no screen; C3.3 let a person file the card in front
   of them from Browse. This is the place those binders finally live.

   COHERENCE, NOT DEMAND AND NOT INVENTORY. A binder says "this card belongs
   here". It does not say you want it and it does not say you own it. Filing a
   card creates no Goal, removing it removes none, and a binder holding cards
   the Collector neither wants nor owns is ordinary curation rather than an
   empty shelf.

   A CARD HERE SHOWED SO LITTLE, AND BATCH 3B-1 CHANGES THAT ON PURPOSE — IN
   ONE PLACE, AND NOT IN THE PRINCIPLE.

   C3.4's rule was that a card in a binder shows its picture, its name, its set
   and number, and when there is a Goal whether it is hunted or watched; that
   ownership and availability do not belong, because how many copies you have
   and which you would part with is a fact about your shelf. The reasoning was
   exactly right for the question a binder asked then, which was about a CARD.

   A binder now holds a GOAL, or one specific copy, or two of three copies of
   one card. So opening one has to say WHICH of your things are here, and a
   thing cannot say which it is without saying what it is — a copy's grading and
   whether you would part with it are no longer telemetry about a card, they are
   how you tell one of your copies from another. The card stays the heading and
   owns no action; every statement and every action belongs to the thing.

   WHAT DID NOT CHANGE: the LIBRARY. It still counts cards, not things, and it
   still carries no ownership total — a binder must not become inventory, and
   saying what is in one is not inventory. Selecting a view still REPLACES the
   library rather than stacking above it, for the reason it always did: the two
   answer different questions.

   NOT IN A BINDER YET IS DERIVED, AND IS NOT A BINDER. Removing the Goals tab
   must not hide a Goal, so the Goals in no ACTIVE binder are listed at the
   bottom, computed on every render from the memberships the server sent — a
   Goal with no membership of its own, never a Goal whose CARD happens to appear
   in a binder, which is what this used to ask and got wrong. There is no record for it, no synthetic binder, and nothing persisted:
   file one of those cards and it leaves the list on the next authoritative
   refresh; take a card out of its last active binder and it comes back. A Goal
   whose only binders are put away counts as unfiled, because the question this
   list answers is about the binders a person is actually using.

   PUT AWAY, NOT DELETED. Archiving is reversible and keeps everything: the
   binder's cards stay in it, and the Goals and copies of those cards are not
   touched at all. Archived binders are hidden behind one quiet control rather
   than moved to a second screen, so bringing one back is one press from where
   somebody noticed it was missing. There is no delete, because the domain has
   none — a binder you want gone can be emptied and put away.

   IT WRITES THROUGH THE SAME COMMANDS AND THE SAME PANEL. Creating, renaming
   and archiving are single commands sent on a deliberate press. Anything about
   a CARD — filing, unfiling, wanting, owning, offering — opens the Card
   Specification panel C3.3 built, with the callback this section was handed.
   There is no second editing grammar here and no command named in this file.
   ========================================================================== */

import React, { useEffect, useMemo, useState } from "react";
import { useCardDescriptions } from "../card-descriptions.js";
import { Panel, Tag } from "../parts.jsx";
import CardArt from "../../card-art.jsx";
import CardSpecification from "../CardSpecification.jsx";
import Collection, { COLLECTION_VIEWS } from "./Collection.jsx";
import { rows, text, plural, tierIntent, tierLabel, byRecency } from "../present.js";

export default function Binder({ state, onBrowseCards = null, onSpecify = null,
  onCreateBinder = null, onRenameBinder = null, onArchiveBinder = null,
  onAddCards = null, fillingBinder = null,
  /* Handed down and passed straight through to the card list, which is where a
     filed object's `Move` and `Remove from Binder` live. This section names no
     command, as it never has. */
  onFileObject = null, onUnfileObject = null }) {
  const binders = rows(state && state.binders);
  const entries = rows(state && state.binderEntries);
  const goals = rows(state && state.goals);
  /* WHAT IS FILED WHERE (Batch 3B-1). A membership names one Goal or one
     CollectorCopy; `collectorCopies` is read for the same reason, because a
     copy filed here is part of what this binder holds and the count has to see
     the card it names. That is the C3.4 source guard being deliberately
     reversed — see the header. */
  const memberships = rows(state && state.binderMemberships);
  const copies = rows(state && state.collectorCopies);

  /* WHERE THEY WERE, WHEN THEY WERE SENT AWAY TO BROWSE. The shell remounts a
     section when it changes, so coming back from "Add cards" would otherwise
     land in the library rather than in the binder somebody is filling. The
     shell is already holding that binder transiently for Browse's sake, so
     this reads it rather than keeping a second memory: while a binder is being
     filled, it is the binder this section opens on. It is not restoration and
     there is nothing stored — stop filling, and this is null again. */
  const [open, setOpen] = useState(fillingBinder ? fillingBinder.binderId : null);
  /* WHICH COLLECTION VIEW IS SHOWING, AND WHAT IS TYPED IN THE BOX. Both are
     this section's own transient state: no command, no durable fact, and
     nothing the server is told. Clearing the box restores the view exactly. */
  const [collectionView, setCollectionView] = useState("binders");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(null);  // { id, name }
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [specifying, setSpecifying] = useState(null);

  const active = useMemo(() => byRecency(binders.filter((b) => !b.archivedAt), "createdAt"),
    [binders]);
  const archived = useMemo(() => byRecency(binders.filter((b) => b.archivedAt), "archivedAt"),
    [binders]);
  /* ONE COUNT, ONE DERIVATION. This used to count raw rows while `Collection`
     counted the cards it could actually name and de-duplicated them, so the
     library could say "3 cards" over a binder that then opened showing one.
     Two live derivations of one fact are two answers to it; this asks the
     question `Collection` asks — how many distinct cards are filed here. */
  /* HOW MANY CARDS OPENING THIS BINDER SHOWS, WHICH IS WHAT THE COUNT HAS
     ALWAYS CLAIMED (Batch 3B-1).

     The axis stays the CARD. A binder now holds objects — a Goal and two of
     three copies of one card are three things — but the Collector reads it
     under card headings, so "2 cards" is still the honest number and still
     equals what the binder opens showing. Counting objects instead would turn
     this into the inventory metric the library has always refused.

     Three sources, one set: the card each filed Goal names, the card each filed
     copy names, and the card each legacy row names. */
  const cardKeyOf = (canonicalCardId, cardId) => (canonicalCardId != null && canonicalCardId !== ""
    ? String(canonicalCardId)
    : cardId != null && cardId !== "" ? `legacy:${cardId}` : null);
  const goalById = new Map(goals.map((g) => [g.id, g]));
  const copyById = new Map(copies.map((c) => [c.id, c]));
  const cardsIn = (binderId) => {
    const out = new Set();
    for (const m of memberships) {
      if (m.binderId !== binderId) continue;
      const thing = m.goalId ? goalById.get(m.goalId) : copyById.get(m.collectorCopyId);
      const key = thing && cardKeyOf(thing.canonicalCardId, thing.cardId);
      if (key) out.add(key);
    }
    for (const e of entries) {
      if (e.binderId !== binderId) continue;
      const key = cardKeyOf(e.canonicalCardId, e.cardId);
      if (key) out.add(key);
    }
    return out;
  };
  const countOf = (binderId) => cardsIn(binderId).size;

  /* DERIVED, EVERY RENDER: THE GOALS WITH NO HOME (Batch 3B-1 corrected this).

     IT USED TO ANSWER THE WRONG QUESTION. The old derivation collected the
     canonical cards named by every entry in an active binder and called a Goal
     filed if its CARD was among them — so a Goal counted as filed because
     somebody had once put that card in a binder, possibly before the Goal
     existed and with no connection to it. That is the card-level answer
     standing in for an object-level one, and it was wrong on the day it was
     written; it simply had no better fact available.

     Now there is one. A Goal is unfiled when THAT GOAL has no membership. A
     legacy entry for the same card says nothing about it — not even when the
     Goal is the only thing the entry could have meant.

     ARCHIVED STILL DOES NOT COUNT, for the reason the header gives: a Goal in a
     binder you have put away is a Goal you cannot see, so the list that exists
     to surface forgotten Goals must surface it. */
  const activeIds = new Set(active.map((b) => b.id));
  const goalsWithHome = new Set(memberships
    .filter((m) => m.goalId && activeIds.has(m.binderId))
    .map((m) => m.goalId));
  /* AND A GOAL THAT NAMES NO CANONICAL CARD STAYS OUT, as it always has. Every
     row in this list promises a describable card and an Open that reaches the
     specification panel, and a pre-C2 Goal naming only `cardId` can do neither
     — it would render as "A card" over a button that opens nothing. 3B-1 makes
     such a Goal FILEABLE for the first time (`fileObject` names the Goal, not
     its card), which is a reason to revisit the list's promise and not a reason
     to put an unopenable row in front of somebody. Recorded as debt, as it was:
     nothing in production can create one. */
  const unfiled = goals.filter((g) => g.canonicalCardId && !goalsWithHome.has(g.id));

  const looking = open ? binders.find((b) => b.id === open) || null : null;

  /* ONE REQUEST FOR THE IDS ON SCREEN, the way Goals has asked since Batch 7:
     never one per row, never the legacy catalogue. */
  /* ONLY THE UNFILED GOALS NOW. The cards inside a binder, and the cards in a
     collection view, are described by `Collection` itself — asking for them
     here as well would be two requests for one screen. This list is the one
     thing this file still renders on its own. */
  const shownIds = useMemo(() => [...new Set(unfiled.map((g) => g.canonicalCardId))],
    [unfiled.map((g) => g.canonicalCardId).join(",")]);
  const cards = useCardDescriptions(onBrowseCards);
  const { described, describe } = cards;
  useEffect(() => { describe(shownIds); }, [shownIds.join(","), describe]);

  const run = async (fn, what) => {
    if (busy) return;
    setBusy(true); setProblem(null);
    try {
      const answer = await fn();
      if (answer && answer.ok === false) {
        setProblem(answer.refused === "name-required"
          ? "A binder needs a name."
          : `MetYet would not ${what}. Try again.`);
      }
    } catch (error) {
      setProblem(`MetYet lost contact, so it cannot tell whether that worked. `
        + "Check your binders before trying again.");
    } finally { setBusy(false); }
  };

  const create = async () => {
    const name = newName.trim();
    if (!name || !onCreateBinder) return;
    await run(() => onCreateBinder(name), "make that binder");
    setNewName("");
  };

  const saveName = async () => {
    const name = (renaming && renaming.name || "").trim();
    if (!name || !onRenameBinder) return;
    await run(() => onRenameBinder(renaming.id, name), "rename that binder");
    setRenaming(null);
  };

  /* THE VIEW SELECTOR AND THE SEARCH BOX, shared by both branches below so the
     two cannot drift apart. Selecting a collection view closes any open binder,
     because they answer different questions and showing both at once would be
     asking the person which one they are looking at. */
  const chooseView = (id) => { setCollectionView(id); setOpen(null); setQuery(""); };
  const searchable = Boolean(looking) || collectionView !== "binders";
  const chrome = (
    <>
      <p className="mcs-views" role="group" aria-label="Collection views">
        {COLLECTION_VIEWS.map((v) => (
          <button key={v.id} type="button"
            className={`mcs-view${(looking ? v.id === "binders" : collectionView === v.id)
              ? "" : " quiet"}`}
            aria-pressed={looking ? v.id === "binders" : collectionView === v.id}
            onClick={() => chooseView(v.id)}>
            {v.label}
          </button>
        ))}
      </p>
      {/* SEARCHES WHAT IS ALREADY YOURS, NOT THE CATALOGUE. It filters the view
          on screen using descriptions that view already holds. Finding a card
          MetYet has but you have said nothing about is Browse's job.

          ONLY WHERE IT FILTERS SOMETHING. The library — your binders, by name —
          is not a list of cards and this box never filtered it; rendering it
          there offered a search that silently did nothing to what was on
          screen. It appears with a collection view, and inside an opened binder
          where it searches that binder's cards. */}
      {searchable ? (
      <p className="mcs-find">
        <input className="mcs-in" type="search" value={query}
          placeholder="Search your cards…" aria-label="Search your cards"
          onChange={(e) => setQuery(e.target.value)} />
        {text(query) ? (
          <button className="mcs-linkish" type="button" onClick={() => setQuery("")}>Clear</button>
        ) : null}
      </p>
      ) : null}
    </>
  );

  /* ---------------------------------------------------------- A BINDER */
  if (looking) {
    return (
      <>
        {specifying ? (
          <div className="mcs-spec-scrim">
            <CardSpecification card={specifying} context={specifying} state={state}
              onCommit={onSpecify} onClose={() => setSpecifying(null)} />
          </div>
        ) : null}
        <p className="mcs-binder-name">
          {text(looking.name) || "A binder"}
          {/* AND SAY WHEN IT IS PUT AWAY (Batch 3B-1 fixed this). An archived
              binder opened in the same view as a live one, with nothing saying
              so and a live "Add cards" button — which routed to a panel where
              this binder could not be chosen at all, because nothing new may be
              filed into one. The route is gone and the state is stated. */}
          {looking.archivedAt ? <span className="mcs-dim"> — put away</span> : null}
        </p>
        {chrome}
        {/* ONE COMPONENT FOR EVERY LIST OF CARDS, so a binder's cards and a
            collection view are read the same way and the copies a person owns
            appear in both. */}
        <Collection state={state} view={{ kind: "binder", binderId: looking.id }}
          query={query} onBrowseCards={onBrowseCards} onSpecify={onSpecify} descriptions={cards}
          onFileObject={onFileObject} onUnfileObject={onUnfileObject} />
        <p className="mcs-goal-do">
          {looking.archivedAt ? (
            <button className="mcs-go" type="button" disabled={busy}
              onClick={() => onArchiveBinder && run(() => onArchiveBinder(looking.id, false),
                "bring that binder back")}>
              Bring back
            </button>
          ) : (
            <button className="mcs-go" type="button" disabled={busy}
              onClick={() => onAddCards && onAddCards({ binderId: looking.id, name: looking.name })}>
              Add cards
            </button>
          )}
          <button className="mcs-go quiet" type="button" onClick={() => { setOpen(null); setQuery(""); }}>
            All binders
          </button>
        </p>
      </>
    );
  }

  /* --------------------------------------------------------- THE LIBRARY */
  return (
    <>
      {specifying ? (
        <div className="mcs-spec-scrim">
          <CardSpecification card={specifying} context={specifying} state={state}
            onCommit={onSpecify} onClose={() => setSpecifying(null)} />
        </div>
      ) : null}

      {chrome}
      {collectionView !== "binders" ? (
        <Collection state={state} view={{ kind: collectionView }} query={query}
          onBrowseCards={onBrowseCards} onSpecify={onSpecify} descriptions={cards} />
      ) : null}

      {collectionView !== "binders" ? null : (
      <>
      <Panel
        title="Your binders"
        note={active.length ? plural(active.length, "binder", "binders") : null}
        empty={active.length ? null
          : "You haven't made a binder yet. A binder is your own grouping of cards — where a "
            + "card belongs, which is a different thing from wanting it or owning it."}
      >
        {active.map((b) => (
          <article className="mcs-binder" key={b.id}>
            {renaming && renaming.id === b.id ? (
              <p className="mcs-spec-new">
                <input className="mcs-in" value={renaming.name} aria-label="Binder name"
                  disabled={busy}
                  onChange={(e) => setRenaming({ id: b.id, name: e.target.value })} />
                <button className="mcs-go" type="button" disabled={busy || !renaming.name.trim()}
                  onClick={saveName}>Save name</button>
                <button className="mcs-go quiet" type="button" disabled={busy}
                  onClick={() => setRenaming(null)}>Cancel</button>
              </p>
            ) : (
              <div className="mcs-binder-head">
                <button className="mcs-binder-open" type="button" onClick={() => { setOpen(b.id); setQuery(""); }}>
                  <span className="mcs-rec-t">{text(b.name) || "A binder"}</span>
                  <span className="mcs-rec-s">{plural(countOf(b.id), "card", "cards")}</span>
                </button>
                <span className="mcs-binder-do">
                  <button className="mcs-linkish" type="button" disabled={busy}
                    onClick={() => setRenaming({ id: b.id, name: text(b.name) || "" })}>
                    Rename
                  </button>
                  <button className="mcs-linkish" type="button" disabled={busy}
                    onClick={() => onArchiveBinder && run(() => onArchiveBinder(b.id, true),
                      "put that binder away")}>
                    Put away
                  </button>
                </span>
              </div>
            )}
          </article>
        ))}
      </Panel>

      <p className="mcs-spec-new">
        <input className="mcs-in" value={newName} placeholder="New binder…"
          aria-label="New binder name" disabled={busy}
          onChange={(e) => setNewName(e.target.value)} />
        <button className="mcs-go" type="button" disabled={busy || !newName.trim()}
          onClick={create}>Make a binder</button>
      </p>
      {problem ? <p className="mcs-add-problem" role="alert">{problem}</p> : null}

      {/* PUT AWAY, AND ONE PRESS FROM COMING BACK. */}
      {archived.length ? (
        <p className="mcs-filter">
          <button className="mcs-go quiet" type="button" aria-pressed={showArchived}
            onClick={() => setShowArchived((on) => !on)}>
            {showArchived ? "Hide binders you've put away"
              : `Show binders you've put away (${archived.length})`}
          </button>
        </p>
      ) : null}
      {showArchived ? (
        <Panel title="Put away" note={plural(archived.length, "binder", "binders")}>
          {archived.map((b) => (
            <article className="mcs-binder" key={b.id}>
              <div className="mcs-binder-head">
                <button className="mcs-binder-open" type="button" onClick={() => { setOpen(b.id); setQuery(""); }}>
                  <span className="mcs-rec-t">{text(b.name) || "A binder"}</span>
                  <span className="mcs-rec-s">{plural(countOf(b.id), "card", "cards")}</span>
                </button>
                <span className="mcs-binder-do">
                  <button className="mcs-linkish" type="button" disabled={busy}
                    onClick={() => onArchiveBinder && run(() => onArchiveBinder(b.id, false),
                      "bring that binder back")}>
                    Bring back
                  </button>
                </span>
              </div>
            </article>
          ))}
        </Panel>
      ) : null}

      {/* NOT IN A BINDER YET — derived, never a record. */}
      {unfiled.length ? (
        <Panel title="Not in a binder yet" note={plural(unfiled.length, "card", "cards")}>
          {unfiled.map((g) => {
            const known = described[g.canonicalCardId];
            return (
              <CardRow key={g.id} known={known} goal={g} canonicalCardId={g.canonicalCardId}
                onOpen={onSpecify && known ? () => setSpecifying(known) : null} />
            );
          })}
        </Panel>
      ) : null}
      </>
      )}
    </>
  );
}

/* ONE CARD, IN A BINDER OR WAITING TO BE IN ONE. Identity, and priority when
   there is a Goal — and deliberately nothing about copies. */
function CardRow({ known, goal, canonicalCardId, onOpen }) {
  const title = (known && known.cardName)
    || (canonicalCardId ? "Loading this card…" : "A card");
  const sub = known
    ? [text(known.expansionName), known.collectorNumber ? `#${known.collectorNumber}` : null]
      .filter(Boolean).join(" · ") || null
    : null;
  return (
    <article className="mcs-group">
      <div className="mcs-group-head">
        <CardArt src={known && known.imageSmall} name={known && known.cardName}
          wrap="mcs-group-art" plate="mcs-art-plate" decorative />
        <div className="mcs-rec-id">
          <div className="mcs-rec-t">{title}</div>
          {sub ? <div className="mcs-rec-s">{sub}</div> : null}
          {goal ? (
            <div className="mcs-rec-tags">
              <Tag tone={goal.tier === "primary" ? "strong" : null}>
                {tierIntent(goal.tier) || tierLabel(goal.tier)}
              </Tag>
            </div>
          ) : null}
        </div>
        {onOpen ? (
          <button className="mcs-go quiet" type="button" onClick={onOpen}>Open</button>
        ) : null}
      </div>
    </article>
  );
}
