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

   WHICH IS WHY A CARD HERE SHOWS SO LITTLE. Its picture, its name, its set and
   number — and, when there is a Goal, whether it is being hunted or watched.
   Priority belongs here because a Goal refines a coherent binder: "these are my
   Mudkips, and these two I am still looking for" is one thought. Ownership and
   availability do not: how many copies you have and which you would part with
   is a fact about your shelf, and Your Cards is the shelf. A count of either
   here would turn curation into inventory one number at a time.

   NOT IN A BINDER YET IS DERIVED, AND IS NOT A BINDER. Removing the Goals tab
   must not hide a Goal, so the Goals that are in no ACTIVE binder are listed at
   the bottom, computed on every render from the binders and entries the server
   sent. There is no record for it, no synthetic binder, and nothing persisted:
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
import { Panel, Tag } from "../parts.jsx";
import CardArt from "../../card-art.jsx";
import CardSpecification from "../CardSpecification.jsx";
import { rows, text, plural, tierIntent, tierLabel, byRecency } from "../present.js";

export default function Binder({ state, onBrowseCards = null, onSpecify = null,
  onCreateBinder = null, onRenameBinder = null, onArchiveBinder = null,
  onAddCards = null, fillingBinder = null }) {
  const binders = rows(state && state.binders);
  const entries = rows(state && state.binderEntries);
  const goals = rows(state && state.goals);

  /* WHERE THEY WERE, WHEN THEY WERE SENT AWAY TO BROWSE. The shell remounts a
     section when it changes, so coming back from "Add cards" would otherwise
     land in the library rather than in the binder somebody is filling. The
     shell is already holding that binder transiently for Browse's sake, so
     this reads it rather than keeping a second memory: while a binder is being
     filled, it is the binder this section opens on. It is not restoration and
     there is nothing stored — stop filling, and this is null again. */
  const [open, setOpen] = useState(fillingBinder ? fillingBinder.binderId : null);
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
  const countOf = (binderId) => entries.filter((e) => e.binderId === binderId).length;

  /* THE CARDS IN AN ACTIVE BINDER. A Goal for one of them is context, not a
     second list. */
  const goalFor = new Map();
  for (const g of goals) if (g.canonicalCardId) goalFor.set(g.canonicalCardId, g);

  /* DERIVED, EVERY RENDER. The Goals whose card is in no ACTIVE binder — see
     the header for why archived membership does not count. */
  const activeIds = new Set(active.map((b) => b.id));
  const filedSomewhereActive = new Set(entries
    .filter((e) => activeIds.has(e.binderId))
    .map((e) => e.canonicalCardId));
  const unfiled = goals
    .filter((g) => g.canonicalCardId && !filedSomewhereActive.has(g.canonicalCardId));

  const looking = open ? binders.find((b) => b.id === open) || null : null;
  const openEntries = looking
    ? entries.filter((e) => e.binderId === looking.id).map((e) => e.canonicalCardId)
    : [];

  /* ONE REQUEST FOR THE IDS ON SCREEN, the way Goals has asked since Batch 7:
     never one per row, never the legacy catalogue. */
  const shownIds = useMemo(() => [...new Set([
    ...openEntries,
    ...unfiled.map((g) => g.canonicalCardId),
  ])], [openEntries.join(","), unfiled.map((g) => g.canonicalCardId).join(",")]);
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
      } catch (error) { /* a binder without captions is still a binder */ }
    })();
    return () => { current = false; };
  }, [shownIds.join(","), onBrowseCards]);

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
        <Panel
          title={text(looking.name) || "A binder"}
          note={openEntries.length ? plural(openEntries.length, "card", "cards") : null}
          empty={openEntries.length ? null
            : "Nothing in this binder yet. A binder is where a card belongs — it doesn't mean "
              + "you want it or own it."}
        >
          {openEntries.map((canonicalCardId) => {
            const known = described[canonicalCardId];
            const goal = goalFor.get(canonicalCardId);
            return (
              <CardRow key={canonicalCardId} known={known} goal={goal}
                canonicalCardId={canonicalCardId}
                onOpen={onSpecify && known ? () => setSpecifying(known) : null} />
            );
          })}
        </Panel>
        <p className="mcs-goal-do">
          <button className="mcs-go" type="button" disabled={busy}
            onClick={() => onAddCards && onAddCards({ binderId: looking.id, name: looking.name })}>
            Add cards
          </button>
          <button className="mcs-go quiet" type="button" onClick={() => setOpen(null)}>
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
                <button className="mcs-binder-open" type="button" onClick={() => setOpen(b.id)}>
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
                <button className="mcs-binder-open" type="button" onClick={() => setOpen(b.id)}>
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
