/* ============================================================================
   PHASE 6 P6-2 — THE BINDERS SCREEN, IN THE PHASE 6 SHAPE
   The frozen Phase 6 prototype (phase6-prototype-01 @ fca2c61, iteration 8E)
   is the reference. One screen, top to bottom:

     search · state filters      All · Primary · Secondary · PC · Trade / Sell
     ▸ Binders · N               closed on arrival; one binder opens in place
     ▸ Unfiled · N               closed on arrival; Goals and copies with no home
     Your Cards                  every Goal and copy, with its state and home

   WHAT A TILE IS. Every tile is ONE durable object the server sent — a Goal or
   a CollectorCopy — never a catalogue card and never a derived record. Its
   state is read straight off the row: a Goal's tier; a copy's `offered`
   (Trade / Sell) or `keeping` (PC); a copy that has said neither is shown as
   "Owned" and is never given a state it did not state. Its home is its one
   membership, or none ("Unfiled", a UI value and not a binder).

   THE FILTERS ARE THE OLD VIEW CHIPS, MADE ONE GRAMMAR. Production had five
   mutually exclusive views (My Binders, All Cards, Primary, Secondary,
   Trade/Sell) and no PC view. Phase 6 makes state a FILTER over everything on
   the screen at once — binders, Unfiled and Your Cards narrow together — and
   adds PC, which is one of the four states the doctrine names. Search and
   filters change only what is seen: nothing is written, nothing is stored,
   and the catalogue is never asked (that is Browse's job).

   NOTHING IS HIDDEN. A Goal or copy in a binder that has been put away keeps
   that home — it is not Unfiled — so it stays reachable in Your Cards,
   labelled with the binder it is in and that the binder is put away. Rows
   filed before Binders organised specific objects (legacy entries) are shown
   inside their binder as earlier filings, read and removed only.

   EVERY WRITE IS AN EXISTING ONE. Make, rename, put away and bring back are
   single commands on a deliberate press; anything about a card opens the Card
   Specification; an opened binder keeps production's Move and Remove on each
   object. Press-and-hold filing is P6-3; the card sheet redesign is P6-4.
   There is no delete, because the domain has none.

   What follows is the earlier header, kept because its reasoning still holds
   for the parts it describes.
   ========================================================================== */

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
import CardArt from "../../card-art.jsx";
import CardSpecification from "../CardSpecification.jsx";
import Collection from "./Collection.jsx";
import { Fact } from "../parts.jsx";
import { rows, text, plural, byRecency, indexById, cardTitle, criteriaLine, gradeLine,
  statusLabel, isGraded, money, day, photoNote, gradeConflictLine } from "../present.js";

const LENSES = Object.freeze([["all", "All"], ["primary", "Primary"], ["secondary", "Secondary"],
  ["pc", "PC"], ["trade", "Trade / Sell"]]);
const MEANING = Object.freeze({ primary: "Primary", secondary: "Secondary", pc: "PC",
  trade: "Trade / Sell", owned: "Owned", goal: "Goal", earlier: "Earlier filing" });

/* WHAT AN EMPTY STATE SAYS, per filter — production's own sentences, kept
   (C2, C3.4b), and one for PC, which had no view before P6-2. */
const EMPTY_FOR = Object.freeze({
  all: "Cards you're looking for or own will appear here. Find one in Browse.",
  primary: "You aren't actively hunting anything. A Primary Goal is a card you're chasing now; "
    + "your Trusted Partners work from it.",
  secondary: "Nothing on your watchlist. A Secondary Goal is a card you're keeping an eye out for "
    + "rather than chasing.",
  pc: "Nothing in your Personal Collection yet. PC is a copy you own and are keeping — your "
    + "Trusted Partners don't see it.",
  trade: "You're not offering any of your copies right now. Offering one is a separate choice "
    + "from owning it — your Trusted Partners see only what you offer.",
});

/* The card a row names, as a key: canonical, legacy, or the copy itself. */
const idText = (v) => (v == null ? "" : String(v));
const cardKeyOf = (canonicalCardId, cardId, copyId = null) => (idText(canonicalCardId)
  || (idText(cardId) ? `legacy:${idText(cardId)}` : idText(copyId) ? `copy:${idText(copyId)}` : null));

/* WHY THIS THING MATTERS, read off the row (never inferred). */
const goalMeaning = (g) => (g.tier === "primary" || g.tier === "secondary" ? g.tier : "goal");
const copyMeaning = (c) => (c.offered === true ? "trade" : c.keeping === true ? "pc" : "owned");

/* Every Goal and copy the server sent, each once, with its one home. */
export function objectsOf(state) {
  const binders = rows(state && state.binders);
  const memberships = rows(state && state.binderMemberships);
  const byId = new Map(binders.map((b) => [b.id, b]));
  const homeOf = new Map();
  for (const m of memberships) {
    if (m.goalId) homeOf.set(`g:${m.goalId}`, m.binderId);
    else if (m.collectorCopyId) homeOf.set(`c:${m.collectorCopyId}`, m.binderId);
  }
  const at = (key) => {
    const homeId = homeOf.get(key) || null;
    const b = homeId ? byId.get(homeId) || null : null;
    return { homeId, homeName: b ? text(b.name) || "A binder" : null, homeAway: !!(b && b.archivedAt) };
  };
  return [
    ...rows(state && state.goals).map((g) => ({ key: `g:${g.id}`, kind: "goal", thing: g,
      cardKey: cardKeyOf(g.canonicalCardId, g.cardId), meaning: goalMeaning(g),
      qual: criteriaLine(g.desired), at: g.secondarySince || g.createdAt || null, ...at(`g:${g.id}`) })),
    ...rows(state && state.collectorCopies).map((c) => ({ key: `c:${c.id}`, kind: "copy", thing: c,
      cardKey: cardKeyOf(c.canonicalCardId, c.cardId, c.id), meaning: copyMeaning(c),
      qual: gradeLine(c), at: c.addedAt || null, ...at(`c:${c.id}`) })),
  ];
}

export default function Binder({ state, onBrowseCards = null, onSpecify = null,
  onCreateBinder = null, onRenameBinder = null, onArchiveBinder = null,
  onAddCards = null, fillingBinder = null,
  /* Handed down and passed straight through to the opened binder's object
     rows, which is where Move and Remove from Binder live. This section names
     no command, as it never has. */
  onFileObject = null, onUnfileObject = null }) {
  const binders = rows(state && state.binders);
  const entries = rows(state && state.binderEntries);
  const catalog = indexById(state && state.catalog);

  /* WHERE THEY WERE, WHEN THEY WERE SENT AWAY TO BROWSE (C3.4): while a binder
     is being filled, it is the binder this section opens on. */
  const [open, setOpen] = useState(fillingBinder ? fillingBinder.binderId : null);
  /* Screen state only — none of it is written anywhere. */
  const [query, setQuery] = useState("");
  const [lens, setLens] = useState("all");
  /* Closed on arrival, as in Phase 6 — except when there are no binders yet:
     then the section's content IS the sentence saying what a binder is and the
     way to make one, and a closed header would hide both. */
  const [sectionOpen, setSectionOpen] = useState(() => !binders.some((b) => !b.archivedAt));
  const [expanded, setExpanded] = useState(null);
  const [unfiledOpen, setUnfiledOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [making, setMaking] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(null);  // { id, name }
  const [manage, setManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [toast, setToast] = useState(null);
  const [specifying, setSpecifying] = useState(null);
  /* A copy's own facts, opened in place from its tile ("Details", Phase 6's
     tile link) — the facts Your Cards always showed, so none of them needs
     the Card Specification to be read. Several may be open at once. */
  const [peek, setPeek] = useState(() => new Set());

  const active = useMemo(() => byRecency(binders.filter((b) => !b.archivedAt), "createdAt"), [binders]);
  const archived = useMemo(() => byRecency(binders.filter((b) => b.archivedAt), "archivedAt"), [binders]);
  const objs = useMemo(() => byRecency(objectsOf(state), "at"), [state]);
  /* Earlier filings: card-level rows from before object Binders. Shown inside
     their binder only — history, never an object, never Unfiled. */
  const earlierIn = (binderId) => [...new Map(entries.filter((e) => e.binderId === binderId)
    .map((e) => [cardKeyOf(e.canonicalCardId, e.cardId), e])).values()]
    .map((e) => ({ key: `e:${binderId}:${cardKeyOf(e.canonicalCardId, e.cardId)}`, kind: "earlier",
      cardKey: cardKeyOf(e.canonicalCardId, e.cardId), meaning: "earlier", qual: null,
      homeId: binderId, homeName: null, homeAway: false }))
    .filter((o) => o.cardKey);

  /* ONE REQUEST FOR THE CARDS ON SCREEN, never one per tile — and only the
     ones on screen: earlier filings are asked about when their binder is
     opened, not on arrival, because a closed binder shows none of them. */
  const searching = Boolean(text(query));
  const activeIdsForSearch = new Set(binders.filter((b) => !b.archivedAt).map((b) => b.id));
  /* ...and while a search is typed, the earlier filings of every active
     binder too, so a closed binder's match count is true rather than "No
     matches" over a card that simply has not been named yet. */
  const shownEntries = entries.filter((e) => e.binderId === expanded || e.binderId === open
    || (searching && activeIdsForSearch.has(e.binderId)));
  const cardKeys = [...new Set([...objs.map((o) => o.cardKey), ...shownEntries.map((e) => cardKeyOf(e.canonicalCardId, e.cardId))]
    .filter((k) => k && !k.startsWith("legacy:") && !k.startsWith("copy:")))];
  const cards = useCardDescriptions(onBrowseCards);
  const { described, describe } = cards;
  useEffect(() => { describe(cardKeys); }, [cardKeys.join(","), describe]);

  /* SEARCH: what is already yours — name, set, number, version. */
  const needle = text(query) ? text(query).toLowerCase() : null;
  const nameOf = (o) => {
    const known = described[o.cardKey];
    if (known && known.cardName) return known.cardName;
    const legacy = o.cardKey && o.cardKey.startsWith("legacy:") ? catalog.get(o.cardKey.slice(7)) : null;
    return cardTitle(legacy) || (o.cardKey && o.cardKey.startsWith("copy:")
      ? "A copy you haven't identified yet" : "Loading this card…");
  };
  const matches = (o) => {
    if (!needle) return true;
    const known = described[o.cardKey];
    const legacy = o.cardKey && o.cardKey.startsWith("legacy:") ? catalog.get(o.cardKey.slice(7)) : null;
    const hay = [known && known.cardName, known && known.expansionName,
      known && known.collectorNumber && `#${known.collectorNumber}`, known && known.finish,
      legacy && legacy.name, legacy && legacy.set, legacy && legacy.num]
      .filter(Boolean).join(" ").toLowerCase();
    return hay.includes(needle);
  };
  const inLens = (o) => lens === "all" || o.meaning === lens;
  const filtering = Boolean(needle) || lens !== "all";
  const visible = (list) => list.filter((o) => inLens(o) && matches(o));
  const lensLabel = (LENSES.find(([id]) => id === lens) || [])[1];
  const noMatch = (where) => (needle
    ? `Nothing ${lens !== "all" ? `${lensLabel} ` : ""}${where} matches “${text(query)}”.`
    : `No ${lensLabel} cards ${where}.`);

  const run = async (fn, what, done = null) => {
    if (busy) return false;
    setBusy(true); setProblem(null); setToast(null);
    try {
      const answer = await fn();
      if (answer && answer.ok === false) {
        setProblem(answer.refused === "name-required" ? "A binder needs a name." : `MetYet would not ${what}. Try again.`);
        return false;
      }
      if (done) setToast(done);
      return true;
    } catch (error) {
      setProblem("MetYet lost contact, so it cannot tell whether that worked. Check your binders before trying again.");
      return false;
    } finally { setBusy(false); }
  };
  const create = async () => {
    const name = newName.trim();
    if (!name || !onCreateBinder) return;
    if (await run(() => onCreateBinder(name), "make that binder", `Made “${name}”.`)) {
      setNewName(""); setMaking(false); setSectionOpen(true);
    }
  };
  const saveName = async () => {
    const name = (renaming && renaming.name || "").trim();
    if (!name || !onRenameBinder) return;
    if (await run(() => onRenameBinder(renaming.id, name), "rename that binder", `Renamed to “${name}”.`)) setRenaming(null);
  };
  const putAway = (b, away) => onArchiveBinder && run(() => onArchiveBinder(b.id, away),
    away ? "put that binder away" : "bring that binder back",
    away ? `Put “${text(b.name) || "the binder"}” away. Bring it back from Binders.` : `Brought “${text(b.name) || "the binder"}” back.`);

  const openCard = (o) => {
    const known = described[o.cardKey];
    return onSpecify && known ? () => setSpecifying(known) : null;
  };
  const where = (o, thisBinderId = null) => (thisBinderId && o.homeId === thisBinderId ? "This binder"
    : o.homeName ? `in ${o.homeName}${o.homeAway ? " (put away)" : ""}` : "Unfiled");

  /* ONE TILE: the art, then WHY it matters (state) and WHERE it lives (home). */
  /* Render helpers, called as functions — not components defined inside the
     render, which React would remount on every keystroke. */
  const tile = (o, showHome = true) => {
    const known = described[o.cardKey] || null;
    const go = openCard(o);
    const name = nameOf(o);
    /* Identity first — name, number, set and version — then this object's own
       grading or criteria. Never another object's. */
    const line = [known && known.collectorNumber ? `${name} #${known.collectorNumber}` : name,
      known && text(known.expansionName), known && known.finish, o.qual].filter(Boolean).join(" · ");
    const art = <CardArt src={known && known.imageSmall} name={known && known.cardName}
      wrap="mcs-otile-art" plate="mcs-art-plate" decorative />;
    const copy = o.kind === "copy" ? o.thing : null;
    /* THE SERVER'S STATUS, when it is not the ordinary one: a copy in a deal
       says so on its tile, in the server's own word. */
    const status = copy && copy.status && copy.status !== "available" ? statusLabel(copy.status) : null;
    const peekable = Boolean(copy);
    const peeking = peekable && peek.has(o.key);
    const togglePeek = () => setPeek((held) => {
      const next = new Set(held); if (next.has(o.key)) next.delete(o.key); else next.add(o.key); return next;
    });
    const conflict = copy ? gradeConflictLine(copy) : null;
    return (
      <li className="mcs-otile" key={o.key} data-key={o.key}>
        {go ? (
          <button type="button" className="mcs-otap" onClick={go}
            aria-label={`${name}, ${MEANING[o.meaning]}, ${where(o)}`}>{art}</button>
        ) : peekable ? (
          <button type="button" className="mcs-otap" onClick={togglePeek}
            aria-label={`${name}, ${MEANING[o.meaning]}, ${where(o)}`}>{art}</button>
        ) : <span className="mcs-otap">{art}</span>}
        <span className="mcs-ometa">
          <span className="mcs-ostate">
            <span className={`mcs-mk mcs-mk-${o.meaning}`}>{MEANING[o.meaning]}</span>
            {showHome ? <span className={`mcs-ohome${o.homeId ? "" : " unf"}`}>{` · ${where(o)}`}</span> : null}
          </span>
          <span className="mcs-oq">{line}</span>
          {status ? <span className="mcs-ostatus">{status}</span> : null}
          {/* A COPY THAT DISAGREES WITH ITSELF SAYS SO (C3.3), on its tile. */}
          {conflict ? <span className="mcs-oconflict">{`Says ${conflict}`}</span> : null}
          {peekable ? (
            <button type="button" className="mcs-linkish mcs-oview" aria-expanded={peeking}
              onClick={togglePeek}>{peeking ? "Hide details" : "Details"}</button>
          ) : null}
          {peeking ? (
            <span className="mcs-ofacts">
              <Fact label={isGraded(copy) ? "Cert" : "Serial"} value={text(copy.cert)} />
              <Fact label="Your reference value" value={money(copy.market)} />
              <Fact label="Added" value={day(copy.addedAt)} />
              <Fact label="Photos" value={photoNote(copy.photos)} />
              <Fact label="Status" value={statusLabel(copy.status)} />
            </span>
          ) : null}
        </span>
      </li>
    );
  };
  const grid = (list, showHome = true) => (
    <ul className="mcs-ogrid">{list.map((o) => tile(o, showHome))}</ul>
  );
  const controls = (placeholder = "Search your cards") => (
    <div className="mcs-bcontrols">
      <p className="mcs-find">
        <input className="mcs-in" type="search" value={query} placeholder={placeholder}
          aria-label="Search your cards" onChange={(e) => setQuery(e.target.value)} />
        {text(query) ? <button className="mcs-linkish" type="button" onClick={() => setQuery("")}>Clear</button> : null}
      </p>
      <p className="mcs-views mcs-lenses" role="group" aria-label="Show">
        {LENSES.map(([id, label]) => (
          <button key={id} type="button" className="mcs-view" aria-pressed={lens === id}
            onClick={() => setLens(id)}>{label}</button>
        ))}
      </p>
    </div>
  );
  const feedback = () => (
    <>
      {problem ? <p className="mcs-add-problem" role="alert">{problem}</p> : null}
      {toast && !problem ? <p className="mcs-toast" role="status">{toast}</p> : null}
    </>
  );
  const spec = () => (specifying ? (
    <div className="mcs-spec-scrim">
      <CardSpecification card={specifying} context={specifying} state={state}
        onCommit={onSpecify} onClose={() => setSpecifying(null)} />
    </div>
  ) : null);
  const renameSheet = renaming ? (
    <div className="mcs-sheet-scrim" role="dialog" aria-label="Rename binder">
      <div className="mcs-sheet">
        <strong>Rename binder</strong>
        <input className="mcs-in" value={renaming.name} aria-label="Binder name" disabled={busy} autoFocus
          onChange={(e) => setRenaming({ id: renaming.id, name: e.target.value })} />
        <p className="mcs-goal-do">
          <button className="mcs-go" type="button" disabled={busy || !renaming.name.trim()} onClick={saveName}>Save name</button>
          <button className="mcs-go quiet" type="button" disabled={busy} onClick={() => setRenaming(null)}>Cancel</button>
        </p>
      </div>
    </div>
  ) : null;

  /* ---------------------------------------------------- AN OPENED BINDER */
  const looking = open ? binders.find((b) => b.id === open) || null : null;
  if (looking) {
    const inside = objs.filter((o) => o.homeId === looking.id);
    const counts = LENSES.slice(1).map(([id, label]) => [label, inside.filter((o) => o.meaning === id).length])
      .filter(([, n]) => n);
    const unsorted = inside.filter((o) => o.meaning === "owned").length;
    const earlier = earlierIn(looking.id).length;
    return (
      <>
        {spec()}
        {renameSheet}
        <div className="mcs-bview-head">
          <button className="mcs-linkish mcs-back" type="button"
            onClick={() => { setOpen(null); setQuery(""); setLens("all"); setManage(false); }}>‹ Binders</button>
          <p className="mcs-binder-name">
            {text(looking.name) || "A binder"}
            {looking.archivedAt ? <span className="mcs-dim"> — put away</span> : null}
          </p>
          {!looking.archivedAt && onAddCards ? (
            <button className="mcs-linkish" type="button"
              onClick={() => onAddCards({ binderId: looking.id, name: looking.name })}>+ Add cards</button>
          ) : null}
          <button className="mcs-more" type="button" aria-label={`Manage ${text(looking.name) || "this binder"}`}
            aria-expanded={manage} onClick={() => setManage((m) => !m)}>•••</button>
        </div>
        {manage ? (
          <p className="mcs-menu" role="menu">
            {onRenameBinder && !looking.archivedAt ? (
              <button role="menuitem" type="button" className="mcs-go quiet" disabled={busy}
                onClick={() => { setManage(false); setRenaming({ id: looking.id, name: text(looking.name) || "" }); }}>
                Rename binder
              </button>
            ) : null}
            {looking.archivedAt ? (
              <button role="menuitem" type="button" className="mcs-go" disabled={busy}
                onClick={() => { setManage(false); putAway(looking, false); }}>Bring back</button>
            ) : (
              <button role="menuitem" type="button" className="mcs-go quiet" disabled={busy}
                onClick={() => { setManage(false); putAway(looking, true); }}>Put away</button>
            )}
          </p>
        ) : null}
        {feedback()}
        <p className="mcs-bsum" aria-label="What's here">
          <b>{plural(inside.length + earlier, "card", "cards")}</b>
          {counts.map(([label, n]) => <span key={label}>{` · ${n} ${label}`}</span>)}
          {unsorted ? <span>{` · ${unsorted} not yet sorted`}</span> : null}
          {earlier ? <span>{` · ${earlier} earlier ${earlier === 1 ? "filing" : "filings"}`}</span> : null}
        </p>
        {controls(`Search ${text(looking.name) || "this binder"}`)}
        <Collection state={state} view={{ kind: "binder", binderId: looking.id }} lens={lens}
          query={query} onBrowseCards={onBrowseCards} onSpecify={onSpecify} descriptions={cards}
          onFileObject={onFileObject} onUnfileObject={onUnfileObject} />
      </>
    );
  }

  /* -------------------------------------------------------- THE HOME */
  const shown = visible(objs);
  const unfiledAll = objs.filter((o) => !o.homeId);
  const unfiledShown = visible(unfiledAll);
  const filedMatches = shown.filter((o) => o.homeId && active.some((b) => b.id === o.homeId)).length;
  const matchWord = (n) => `${n} ${n === 1 ? "match" : "matches"}`;
  const binderRow = (b, away = false) => {
    const inside = [...objs.filter((o) => o.homeId === b.id), ...earlierIn(b.id)];
    const here = visible(inside);
    const isOpen = expanded === b.id;
    return (
      <div key={b.id} className={`mcs-bcover${isOpen ? " open" : ""}`} data-binder={b.id}>
        <button type="button" className="mcs-bhead" aria-expanded={isOpen}
          onClick={() => setExpanded(isOpen ? null : b.id)}>
          <span className="mcs-bline"><b>{text(b.name) || "A binder"}</b>
            <span>{away ? "Put away · " : ""}{plural(inside.length, "card", "cards")}</span></span>
          {filtering && !isOpen && inside.length ? (
            <span className="mcs-bmatch">{here.length ? matchWord(here.length) : "No matches"}</span>
          ) : null}
        </button>
        {isOpen ? (
          <div className="mcs-bbody">
            {here.length ? grid(here, false)
              : <p className="mcs-dim">{inside.length ? noMatch(`in ${text(b.name) || "this binder"}`)
                : `No cards in ${text(b.name) || "this binder"} yet.`}</p>}
            {/* A new place starts unfiltered: a search typed for the whole
                screen is not one the person asked of this binder. */}
            <button type="button" className="mcs-linkish mcs-openb"
              onClick={() => { setOpen(b.id); setQuery(""); setLens("all"); setManage(false); }}>
              {away ? `Open ${text(b.name) || "this binder"} — bring it back ›`
                : `Open ${text(b.name) || "this binder"} — add cards, rename, put away ›`}
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <>
      {spec()}
      {controls()}
      {feedback()}

      <section className="mcs-bsection" aria-label="Your binders">
        <button type="button" className="mcs-sechead" aria-expanded={sectionOpen}
          onClick={() => setSectionOpen((v) => !v)}>
          <span>{`Binders · ${active.length}`}</span>
          {filtering && !sectionOpen && filedMatches ? <span className="mcs-bmatch">{matchWord(filedMatches)}</span> : null}
        </button>
        {sectionOpen ? (
          <div className="mcs-covers">
            {active.length ? active.map((b) => binderRow(b))
              : <p className="mcs-dim mcs-bempty">You haven&apos;t made a binder yet. A binder is your own grouping of cards — where a card belongs, which is a different thing from wanting it or owning it.</p>}
            {making ? (
              <p className="mcs-spec-new mcs-newb">
                <input className="mcs-in" value={newName} placeholder="New binder…" aria-label="New binder name"
                  disabled={busy} autoFocus onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setMaking(false); }} />
                <button className="mcs-go" type="button" disabled={busy || !newName.trim()} onClick={create}>Make a binder</button>
                <button className="mcs-go quiet" type="button" disabled={busy} onClick={() => { setMaking(false); setNewName(""); }}>Cancel</button>
              </p>
            ) : onCreateBinder ? (
              <button type="button" className="mcs-bcover mcs-newcover" onClick={() => setMaking(true)}>+ New binder</button>
            ) : null}
            {archived.length ? (
              <button type="button" className="mcs-linkish mcs-away" aria-pressed={showArchived}
                onClick={() => setShowArchived((v) => !v)}>
                {showArchived ? "Hide binders you've put away" : `Show binders you've put away (${archived.length})`}
              </button>
            ) : null}
            {showArchived ? archived.map((b) => binderRow(b, true)) : null}
          </div>
        ) : null}
      </section>

      <section className={`mcs-bsection mcs-unfiled${unfiledOpen ? " open" : ""}`} aria-label="Unfiled">
        <button type="button" className="mcs-sechead" aria-expanded={unfiledOpen}
          onClick={() => setUnfiledOpen((v) => !v)}>
          <span>{`Unfiled · ${filtering && unfiledAll.length
            ? `${unfiledShown.length} of ${plural(unfiledAll.length, "card", "cards")}`
            : plural(unfiledAll.length, "card", "cards")}`}</span>
        </button>
        {unfiledOpen ? (!unfiledAll.length ? <p className="mcs-dim mcs-bempty">Nothing is Unfiled.</p>
          : unfiledShown.length ? grid(unfiledShown, false)
            : <p className="mcs-dim mcs-bempty">{noMatch("Unfiled")}</p>) : null}
      </section>

      <section className="mcs-bsection mcs-results" aria-label="Your Cards">
        <h2 className="mcs-rhead">Your Cards</h2>
        {objs.length ? (
          <p className="mcs-rcount" role="status">
            {`${shown.length} ${lens !== "all" ? `${lensLabel} ` : ""}${shown.length === 1 ? "card" : "cards"}${needle ? ` matching “${text(query)}”` : ""}`}
          </p>
        ) : null}
        {shown.length ? grid(shown)
          : <p className="mcs-dim mcs-bempty">{needle && objs.length ? noMatch("of yours") : EMPTY_FOR[lens] || EMPTY_FOR.all}</p>}
      </section>
    </>
  );
}
