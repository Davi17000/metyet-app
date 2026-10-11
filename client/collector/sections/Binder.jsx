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

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useCardDescriptions } from "../card-descriptions.js";
import CardArt from "../../card-art.jsx";
import CardSpecification from "../CardSpecification.jsx";
import { versionLabel } from "../CardDetail.jsx";
import { StateChip } from "../states.jsx";
import CardEdit from "../CardEdit.jsx";
import Collection from "./Collection.jsx";
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
  secondary: "Nothing you're interested in yet. A Secondary Goal is a card you're interested in, "
    + "without chasing it now.",
  pc: "Nothing in your Personal Collection yet. PC is a copy you own and are keeping — your "
    + "Trusted Partners don't see it.",
  trade: "You're not offering any of your copies right now. Offering one is a separate choice "
    + "from owning it — your Trusted Partners see only what you offer.",
});

/* ---------------------------------------------------------- FILING (P6-3)
   PICK A CARD UP AND PUT IT WHERE IT BELONGS — the Phase 6 gesture (frozen
   prototype, iteration 8), on production's own commands.
     Tap            opens the card, exactly as before. Never files.
     Press & hold   (touch, 450ms without moving) picks it up.
     Press & drag   (mouse) picks it up: a mouse drag can never be a scroll.
     Moving first   (touch) is a scroll, and nothing is picked up.
     Drop           on a destination sends ONE command — fileObject to a
                    binder, unfileObject to Unfiled — and success is said only
                    when the server has answered.
     Anything else  Cancel, Escape, releasing elsewhere, a cancelled pointer,
                    the window losing focus: the card goes back, zero writes.
   Filing changes WHERE a thing lives, never what it MEANS: no state is sent,
   and the domain's membership rules (one home; nothing new into a binder that
   is put away) decide. Move and Remove (the List view) and the Binder choice
   in a tile's Details are the keyboard and accessible paths to the same
   commands. */
export const HOLD_MS = 450;
export const HOLD_TOLERANCE = 8;
export function useHold(onPickUp) {
  const pending = useRef(null);
  const swallow = useRef(false);
  const clear = () => { if (pending.current) { clearTimeout(pending.current.timer); pending.current = null; } };
  useEffect(() => clear, []);
  return {
    swallowClick: () => { const was = swallow.current; swallow.current = false; return was; },
    handlers: (o) => ({
      onPointerDown: (e) => {
        if (e.button !== 0 || e.isPrimary === false) return;
        clear(); swallow.current = false;
        const p = { id: e.pointerId, x: e.clientX, y: e.clientY, type: e.pointerType };
        p.timer = setTimeout(() => { pending.current = null; swallow.current = true; onPickUp(o, p); }, HOLD_MS);
        pending.current = p;
      },
      onPointerMove: (e) => {
        const p = pending.current;
        if (!p || e.pointerId !== p.id || Math.hypot(e.clientX - p.x, e.clientY - p.y) <= HOLD_TOLERANCE) return;
        clear();
        if (p.type === "mouse") { swallow.current = true; onPickUp(o, { ...p, x: e.clientX, y: e.clientY }); }
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onContextMenu: (e) => e.preventDefault(),
      onDragStart: (e) => e.preventDefault(),
    }),
  };
}

/* THE MOVE CHOOSER (P6-F4 B2A): the same destinations as the press-and-hold
   surface, chosen by a tap instead of a carry. Opening it changes nothing;
   only a destination does, through the same `fileTo` the gesture uses. */
export function MoveChooser({ label, name, dests, onPick, onCancel }) {
  useEffect(() => {
    if (typeof window === "undefined" || !window.addEventListener) return undefined;
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onCancel]);
  return (
    <div className="mcs-filing mcs-choose" role="dialog" aria-modal="true" aria-label="Where should this go?">
      <div className="mcs-fhead"><b>Where should this go?</b><span>{label}</span></div>
      <div className="mcs-dests" role="group" aria-label={`Binder for ${name}`}>
        {dests.map((d) => (
          <button key={d.id} type="button" data-dest={d.id} disabled={d.off}
            className={`mcs-dest${d.off ? " off" : ""}${d.id === "cancel" ? " cancel" : ""}${d.id === "new" ? " new" : ""}`}
            onClick={() => (d.id === "cancel" ? onCancel() : d.off ? null : onPick(d.id))}>
            <b>{d.label}</b>{d.sub ? <span>{d.sub}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/* The filing surface: over everything (the tab bar and any sheet), the card
   follows the pointer, destinations are large, and Cancel is always there. A
   destination counts only once the card has been CARRIED to it — whatever is
   under the finger at the moment of lifting is not a choice. */
export function FilingLayer({ label, art, origin, dests, onDrop, onCancel }) {
  const [pos, setPos] = useState({ x: origin.x, y: origin.y });
  const [hover, setHover] = useState(null);
  const done = useRef(false);
  useEffect(() => {
    const at = (x, y) => {
      const el = typeof document !== "undefined" && document.elementFromPoint ? document.elementFromPoint(x, y) : null;
      const d = el && el.closest ? el.closest("[data-dest]") : null;
      return d && d.getAttribute("aria-disabled") !== "true" ? d.getAttribute("data-dest") : null;
    };
    const finish = (fn) => { if (done.current) return; done.current = true; fn(); };
    let carried = false;
    const move = (e) => {
      if (e.pointerId !== origin.id) return;
      if (!carried && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > HOLD_TOLERANCE) carried = true;
      setPos({ x: e.clientX, y: e.clientY }); setHover(carried ? at(e.clientX, e.clientY) : null);
    };
    const up = (e) => {
      if (e.pointerId !== origin.id) return;
      const d = carried ? at(e.clientX, e.clientY) : null;
      finish(() => (d && d !== "cancel" ? onDrop(d) : onCancel()));
    };
    const cancel = () => finish(onCancel);
    const pcancel = (e) => { if (e.pointerId === origin.id) cancel(); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); cancel(); } };
    const vis = () => { if (document.hidden) cancel(); };
    const noScroll = (e) => e.preventDefault();
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", pcancel); window.addEventListener("keydown", key, true);
    window.addEventListener("blur", cancel); document.addEventListener("visibilitychange", vis);
    document.addEventListener("touchmove", noScroll, { passive: false });
    return () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", pcancel); window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel); document.removeEventListener("visibilitychange", vis);
      document.removeEventListener("touchmove", noScroll);
    };
  }, []);
  return (
    <div className="mcs-filing" role="dialog" aria-label="Where should this go?">
      <div className="mcs-fhead"><b>Where should this go?</b><span>{label}</span></div>
      <div className="mcs-dests">
        {dests.map((d) => (
          <div key={d.id} role="button" data-dest={d.id} aria-disabled={d.off ? "true" : undefined}
            className={`mcs-dest${hover === d.id ? " over" : ""}${d.off ? " off" : ""}${d.id === "cancel" ? " cancel" : ""}${d.id === "new" ? " new" : ""}`}
            onClick={() => finish(() => (d.id === "cancel" ? onCancel() : d.off ? null : onDrop(d.id)))}>
            <b>{d.label}</b>{d.sub ? <span>{d.sub}</span> : null}
          </div>
        ))}
      </div>
      <div className="mcs-ghost" style={{ left: pos.x, top: pos.y }} aria-hidden="true">{art}</div>
    </div>
  );
}

/* What the server's refusal means for a filing, in a sentence. */
const FILING_REFUSED = Object.freeze({
  "binder-archived": "That binder has been put away. Bring it back first, or choose another.",
  "not-found": "That card or binder has changed since this screen was drawn. The latest is shown now.",
  "not-owner": "That isn't yours to file.",
});
const STALE_REFUSALS = new Set(["not-found", "binder-archived"]);

/* How long a confirmation stays before it gets out of the way. Move and Remove
   stay permanently available in the card sheet and the binder list. */
const TOAST_MS = 6000;

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
  onFileObject = null, onUnfileObject = null,
  /* A re-read, for when a filing finds the screen out of date (P6-3). */
  onRefresh = null }) {
  const binders = rows(state && state.binders);
  const entries = rows(state && state.binderEntries);
  const catalog = indexById(state && state.catalog);

  /* WHERE THEY WERE, WHEN THEY WERE SENT AWAY TO BROWSE (C3.4): while a binder
     is being filled, it is the binder this section opens on. */
  /* P6-3.1: there is no separate binder screen any more — a binder is opened
     IN PLACE, so returning from "Add cards" lands with that binder open. */
  const filling = fillingBinder ? fillingBinder.binderId : null;
  /* Screen state only — none of it is written anywhere. */
  const [query, setQuery] = useState("");
  const [lens, setLens] = useState("all");
  /* Closed on arrival, as in Phase 6 — except when there are no binders yet:
     then the section's content IS the sentence saying what a binder is and the
     way to make one, and a closed header would hide both. */
  const [sectionOpen, setSectionOpen] = useState(() => Boolean(filling) || !binders.some((b) => !b.archivedAt));
  const [expanded, setExpanded] = useState(filling);
  const [unfiledOpen, setUnfiledOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [making, setMaking] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(null);  // { id, name }
  /* The one binder whose quiet "•••" menu is open, if any (P6-3.1). */
  const [menuFor, setMenuFor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [toast, setToast] = useState(null);
  const [specifying, setSpecifying] = useState(null);
  /* A Goal's or copy's own facts, in a sheet (P6-3.1) rather than under the
     tile: the facts Your Cards always showed, its Binder choice, and a way
     into the Card Specification. One at a time. */
  const [detailKey, setDetailKey] = useState(null);
  /* THE SAVED CARD'S PAGE (P6-F4 B2B, CardEdit) keeps its own answers; here
     is only whether its Move chooser is open. */
  const [moving, setMoving] = useState(false);       // the Move chooser is open for the open card
  /* + NEW BINDER WHILE MOVING (P6-F4 B2A): the card waiting for its new
     binder's name, and what the name prompt says while it works. */
  const [naming, setNaming] = useState(null);       // { key, name, busy, problem }
  /* + ADD CARDS (P6-F4 B3): the binder the chooser is for; the picker of the
     Collector's own Goals and copies (prototype Picker), what is ticked in it,
     its search and state lens, and the move confirmation. */
  const [addingTo, setAddingTo] = useState(null);   // { id, name } — the chooser
  const [picking, setPicking] = useState(null);     // { id, name } — the picker
  const [picked, setPicked] = useState(() => new Set());
  const [pickQuery, setPickQuery] = useState("");
  const [pickLens, setPickLens] = useState("all");
  const [confirmMove, setConfirmMove] = useState(false);
  const pickingRef = useRef(false);
  /* The latest projection, for reading what is true AFTER an awaited refresh. */
  const stateRef = useRef(state); stateRef.current = state;
  /* One new binder at a time: a ref, because two taps in one instant both see
     the state from before the first re-rendered (the same guard filing uses). */
  const creatingRef = useRef(false);
  const openSheet = (key) => {
    setDetailKey(key); setMoving(false); setProblem(null);   // an old warning is about something else
  };
  /* FILING (P6-3): the card being carried, the one being filed (one at a
     time — a second gesture while a command is out is ignored), and the one
     that just landed. The ref is the guard, because two drops in one instant
     both see the state from before the first re-rendered. */
  const [held, setHeld] = useState(null);          // { o, origin }
  const [filingKey, setFilingKey] = useState(null);
  const [landedKey, setLandedKey] = useState(null);
  const filingRef = useRef(null);
  /* A confirmation is a moment too: it gets out of the way by itself. A
     problem stays until the next action, because it is something to read. */
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);
  /* The landed highlight is a moment, not a state: it clears itself. */
  useEffect(() => {
    if (!landedKey) return undefined;
    const t = setTimeout(() => setLandedKey(null), 1400);
    return () => clearTimeout(t);
  }, [landedKey]);
  /* A binder shown as production's list rows instead of tiles — every copy
     fact and Move / Remove in full, from the binder's menu (P6-3.1). */
  const [listFor, setListFor] = useState(null);

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
  const shownEntries = entries.filter((e) => e.binderId === expanded
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

  /* ONE FILING, ONE COMMAND, SAID WHEN THE SERVER HAS ANSWERED. */
  const filable = (o) => (o.kind === "goal" || o.kind === "copy") && !!onFileObject && !!onUnfileObject;
  const binderName = (id) => { const b = binders.find((x) => x.id === id); return b ? text(b.name) || "A binder" : null; };
  const fileTo = async (o, dest, undoing = false, made = null) => {
    if (filingRef.current || !filable(o)) return false;
    /* `made`: { binderId, name } when the destination is a binder this move
       just created. A failure then says the binder exists and offers to try
       the MOVE again into it — never to make it again. */
    const destName = (id) => (made && id === made.binderId ? made.name : binderName(id));
    const stillMade = (text) => (made ? { text: `Made “${made.name}”, but ${nameOf(o)} couldn't be moved into it: ${text}`,
      retry: { key: o.key, binderId: made.binderId, name: made.name } } : text);
    const to = dest || null;
    if (to === (o.homeId || null)) return false;
    const what = o.kind === "goal" ? { goalId: o.thing.id } : { collectorCopyId: o.thing.id };
    const from = o.homeId || null;
    filingRef.current = o.key; setFilingKey(o.key); setProblem(null); setToast(null);
    try {
      const answer = to ? await onFileObject({ binderId: to, ...what }) : await onUnfileObject(what);
      if (answer && answer.ok === false) {
        setProblem(stillMade(FILING_REFUSED[answer.refused] || "MetYet would not file that. Nothing was changed."));
        if (STALE_REFUSALS.has(answer.refused) && onRefresh) { try { await onRefresh(); } catch (e) { /* said already */ } }
        return false;
      }
      setLandedKey(o.key);
      /* WHERE IT WENT, OPENED (prototype fileByDrop): only once the server has
         said yes, and only for a filing into a binder — not for its Undo. */
      if (to && !undoing) { setSectionOpen(true); setExpanded(to); setListFor(null); }
      const name = nameOf(o);
      /* UNDO IS THE SAME COMMANDS, BACKWARDS — offered only where they can
         work: back to Unfiled, or back into a binder that is still in use. A
         home that has been put away cannot take a card back, so no undo is
         promised there; Move is. */
      const back = from === null || active.some((b) => b.id === from) ? { key: o.key, to: from } : null;
      setToast({ text: undoing ? `Put back: ${name} is ${to ? `in ${destName(to)}` : "Unfiled"} again.`
        : to ? `${name} is filed in ${destName(to)}.` : `${name} is Unfiled now.`, undo: undoing ? null : back });
      return true;
    } catch (error) {
      setProblem(stillMade("MetYet lost contact, so it can't tell whether that was filed. Check this card before trying again."));
      if (onRefresh) { try { await onRefresh(); } catch (e) { /* said already */ } }
      return false;
    } finally {
      filingRef.current = null; setFilingKey(null);
    }
  };
  /* UNDO, CHECKED AGAIN AT THE MOMENT IT IS PRESSED: the place it goes back
     to may have been put away since it was offered. Then nothing is sent. */
  const undo = (u) => {
    const o = objs.find((x) => x.key === u.key);
    if (!o) { setToast(null); setProblem("That card has changed since it was filed. The latest is shown."); return; }
    if (u.to && !active.some((b) => b.id === u.to)) {
      setToast(null);
      setProblem(`${nameOf(o)} can't go back there — that binder has been put away. Use Move to choose another.`);
      return;
    }
    fileTo(o, u.to, true);
  };

  /* + NEW BINDER, THEN THE MOVE (P6-F4 B2A). Two existing commands, in order:
     createBinder; only once it is confirmed, fileObject into the binder it
     returned. Nothing is filed if the binder was not made. If the binder was
     made and the move then fails, the binder is kept and the move — only the
     move — can be tried again into it. If the answer to createBinder was lost,
     the projection is re-read BEFORE anything is sent again: a binder that
     now exists by that name is used, never made a second time. */
  const latestBinders = () => rows(stateRef.current && stateRef.current.binders);
  const reread = async () => {
    if (onRefresh) { try { await onRefresh(); } catch (e) { /* the screen says what it knows */ } }
    await new Promise((done) => setTimeout(done, 0));
  };
  const moveToNew = async (key, raw) => {
    const name = text(raw);
    const o = objs.find((x) => x.key === key);
    if (!name || !o || !onCreateBinder || creatingRef.current || filingRef.current) return;
    creatingRef.current = true;
    try { await makeAndMove(key, name, o); } finally { creatingRef.current = false; }
  };
  const makeAndMove = async (key, name, o) => {
    const before = new Set(latestBinders().map((b) => b.id));
    setNaming({ key, name, busy: true, problem: null }); setProblem(null); setToast(null);
    let binderId = null;
    try {
      const answer = await onCreateBinder(name);
      if (answer && answer.ok === false) {
        setNaming({ key, name, busy: false, problem: answer.refused === "name-required"
          ? "A binder needs a name." : "MetYet would not make that binder. Nothing was changed." });
        return;
      }
      binderId = answer && typeof answer.value === "string" ? answer.value : null;
    } catch (error) { binderId = null; }
    if (!binderId) {
      /* NOT KNOWN WHETHER IT WAS MADE: look, don't guess. */
      await reread();
      const madeNow = latestBinders().filter((b) => !before.has(b.id) && text(b.name) === name && !b.archivedAt);
      if (madeNow.length !== 1) {
        setNaming({ key, name, busy: false, problem: madeNow.length
          ? "MetYet lost contact while making that binder. Check your binders before trying again."
          : "MetYet lost contact, and “" + name + "” wasn't made. Nothing was changed — you can try again." });
        return;
      }
      binderId = madeNow[0].id;
    }
    setNaming(null); setMoving(false); setSectionOpen(true);
    await fileTo(o, binderId, false, { binderId, name });
  };
  /* TRY MOVING AGAIN — into the binder already made; never createBinder. */
  const retryMove = async (r) => {
    setProblem(null);
    await reread();
    const o = objectsOf(stateRef.current).find((x) => x.key === r.key);
    const there = latestBinders().find((b) => b.id === r.binderId);
    if (!o) { setProblem("That card has changed since. The latest is shown."); return; }
    if (!there || there.archivedAt) { setProblem(`“${r.name}” isn't available any more. Use Move to choose another binder.`); return; }
    if (o.homeId === r.binderId) { setExpanded(r.binderId); setToast({ text: `${nameOf(o)} is filed in ${r.name}.`, undo: null }); return; }
    await fileTo(o, r.binderId, false, { binderId: r.binderId, name: r.name });
  };

  /* A CARD THAT IS GONE ON RE-READ takes its sheet with it — and the reason
     moves to the bar, so the sheet never just vanishes unexplained. */
  /* (A card its owner has just removed, from its own page, goes quietly: that
     is the outcome they asked for, and the bar says so instead.) */
  const removingRef = useRef(null);
  const heldRef = useRef(null);
  useEffect(() => {
    if (!detailKey || objs.some((x) => x.key === detailKey)) return;
    if (heldRef.current && heldRef.current.key === detailKey) return;   // its guided step is saying what happened
    setDetailKey(null); setMoving(false);
    if (removingRef.current && removingRef.current.key === detailKey) {
      setToast({ text: removingRef.current.said, undo: null }); removingRef.current = null; return;
    }
    setProblem("That card has changed elsewhere and is no longer here. The latest is shown.");
  }, [objs, detailKey]);

  const hold = useHold((o, origin) => {
    if (!filable(o) || specifying || detailKey || renaming || filingRef.current) return;
    setHeld({ o, origin });
  });
  /* ONE DESTINATION, WHICHEVER WAY IT WAS CHOSEN — carried (press and
     hold) or tapped (Move). The same list, the same commands. */
  const goTo = (o, d) => {
    if (!o || !d) return;
    if (d === "new") { setNaming({ key: o.key, name: "", busy: false, problem: null }); return; }
    setMoving(false);
    if (d === "unfiled") fileTo(o, null);
    else if (d.startsWith("b:")) fileTo(o, d.slice(2));
  };
  const dropOn = (d) => { const o = held && held.o; setHeld(null); goTo(o, d); };
  const destsFor = (o) => [
    ...active.map((b) => ({ id: `b:${b.id}`, label: text(b.name) || "A binder",
      sub: b.id === o.homeId ? "Current binder" : null, off: b.id === o.homeId })),
    ...(o.homeId ? [{ id: "unfiled", label: "Unfiled", sub: `Take it out of ${o.homeName}` }] : []),
    ...(onCreateBinder ? [{ id: "new", label: "+ New binder", sub: null }] : []),
    { id: "cancel", label: "Cancel", sub: "Put it back" },
  ];

  const openCard = (o) => {
    const known = described[o.cardKey];
    return onSpecify && known ? () => setSpecifying(known) : null;
  };
  /* The Phase 6 placeholder's facts for one card (P6-F1): only what the
     catalogue described; nothing guessed. */
  const phOf = (o, known) => ({ key: o.cardKey, set: known && known.expansionName,
    number: known && known.collectorNumber ? String(known.collectorNumber) : null });
  const where = (o, thisBinderId = null) => (thisBinderId && o.homeId === thisBinderId ? "This binder"
    : o.homeName ? `in ${o.homeName}${o.homeAway ? " (put away)" : ""}` : "Unfiled");


  /* ONE TILE, IN THE PROTOTYPE'S ORDER (P6-F4 B1; prototype ObjectTile and
     .library .ometa, fca2c61 main.jsx L686–709, index.html L150–153, 251–255,
     348): the picture first and largest; then WHY it matters (its state);
     then, in Your Cards, WHERE it lives; then WHICH card — name and number,
     the version in a collector's words ("Holo", never "holofoil"), and its
     own grade or wanted grade. Everything else — set, cert, value, photos,
     its Binder choice — is one tap away in the card sheet. Render helpers are
     called as functions, not components defined inside the render (which
     React would remount on every keystroke). */
  const tile = (o, showHome = true) => {
    const known = described[o.cardKey] || null;
    const go = openCard(o);
    const name = nameOf(o);
    const num = known && known.collectorNumber ? `#${known.collectorNumber}` : null;
    const ident = [[name, num].filter(Boolean).join(" "), known && known.finish ? versionLabel(known) : null, o.qual || null]
      .filter(Boolean).join(" · ");
    const art = <CardArt src={known && known.imageSmall} name={known && known.cardName}
      wrap="mcs-otile-art" plate="mcs-art-plate" decorative card={phOf(o, known)} />;
    const copy = o.kind === "copy" ? o.thing : null;
    /* THE SERVER'S STATUS, when it is not the ordinary one: a copy in a deal
       says so on its tile, in the server's own word. */
    const status = copy && copy.status && copy.status !== "available" ? statusLabel(copy.status) : null;
    /* A COPY THAT DISAGREES WITH ITSELF SAYS SO (C3.3), on its tile. */
    const conflict = copy ? gradeConflictLine(copy) : null;
    const detailable = o.kind === "goal" || o.kind === "copy";
    const canFile = filable(o);
    const tapProps = canFile ? hold.handlers(o) : {};
    const tap = (fn) => (e) => { if (canFile && hold.swallowClick()) { e.preventDefault(); return; } fn(); };
    /* A TAP OPENS THE CARD (P6-4): a Goal or copy opens its own sheet; an
       earlier filing, which is no object, opens the card. */
    const press = detailable ? () => openSheet(o.key) : go;
    return (
      <li className={`mcs-otile${held && held.o.key === o.key ? " lifted" : ""}${filingKey === o.key ? " filing" : ""}${landedKey === o.key ? " landed" : ""}`}
        key={o.key} data-key={o.key} data-home={o.homeId || "unfiled"}>
        {press ? (
          <button type="button" className={`mcs-otap${canFile ? " holdable" : ""}`} onClick={tap(press)} {...tapProps}
            title={canFile ? "Tap to open · press and hold to file" : undefined}
            aria-haspopup={detailable ? "dialog" : undefined}
            aria-label={`${name}, ${MEANING[o.meaning]}, ${where(o)}`}>{art}</button>
        ) : <span className="mcs-otap">{art}</span>}
        <span className="mcs-ometa">
          <span className="mcs-ostate"><StateChip kind={o.meaning} label={MEANING[o.meaning]} /></span>
          {showHome ? <span className={`mcs-oloc${o.homeId ? "" : " unf"}`}>{where(o)}</span> : null}
          <span className="mcs-oq">{ident}</span>
          {status ? <span className="mcs-ostatus">{status}</span> : null}
          {conflict ? <span className="mcs-oconflict">{`Says ${conflict}`}</span> : null}
          {filingKey === o.key ? <span className="mcs-ostatus" role="status">Filing…</span> : null}
        </span>
      </li>
    );
  };
  const grid = (list, showHome = true) => (
    <ul className="mcs-ogrid">{list.map((o) => tile(o, showHome))}</ul>
  );

  /* A SAVED CARD, FULL SCREEN (P6-F4 B2B): one Goal or copy, by its own id,
     opened on its saved answers (CardEdit). Its Move is Batch 2A's chooser;
     its saves and removals are the steps the entrance already maps. */
  const cardEdit = () => {
    /* A GUIDED STEP THAT STOPS LOOKING (B4) keeps its page while the Goal goes,
       so the result is said; held only while it asks */
    const o = detailKey ? objs.find((x) => x.key === detailKey)
      || (heldRef.current && heldRef.current.key === detailKey ? heldRef.current : null) : null;
    if (!o || (o.kind !== "goal" && o.kind !== "copy")) return null;
    const close = () => { heldRef.current = null; setDetailKey(null); setMoving(false); };
    const save = onSpecify ? (step, id) => {
      if ((step.kind === "stop-looking" || step.kind === "forget-copy") && !heldRef.current) {
        removingRef.current = { key: o.key, said: step.kind === "stop-looking" ? `Stopped looking for ${nameOf(o)}.` : `Removed this copy of ${nameOf(o)}.` };
      }
      return Promise.resolve(onSpecify(step, id)).then((answer) => {
        if (answer && answer.ok === false) removingRef.current = null;   // refused: nothing is going
        return answer;
      });
    } : null;
    return (
      <CardEdit key={o.key} kind={o.kind} thing={o.thing} known={described[o.cardKey] || null}
        homeName={o.homeName} homeAway={o.homeAway} homeId={o.homeId || null} state={state}
        onOpenRecord={(key) => { heldRef.current = null; setMoving(false); setDetailKey(key); }}
        onHold={(on) => { heldRef.current = on ? o : null; }}
        busy={!!filingKey} onClose={close} onSave={save}
        onMove={filable(o) ? () => setMoving(true) : null} onRefresh={onRefresh}
        onRemoved={(said) => { removingRef.current = null; close(); setToast({ text: said, undo: null }); }} />
    );
  };

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
  /* CONFIRMATION, LIGHTLY (P6-4): one compact bar at the bottom of the
     content, above the tab bar and above an open card sheet — so Undo is
     there without opening anything — and gone after a few seconds. A
     problem stays until it is dismissed or the next action. */
  const feedback = () => (problem || toast ? (
    /* over a card's page, the bar rises above the page's own dock (P6-F4 B2B) */
    <div className={`mcs-snack-wrap${detailKey ? " over-page" : ""}`}>
      {problem ? (
        <p className="mcs-snack warn" role="alert">
          <span>{typeof problem === "string" ? problem : problem.text}</span>
          {problem.retry ? (
            <button type="button" className="mcs-undo" disabled={!!filingKey}
              onClick={() => retryMove(problem.retry)}>Try moving again</button>
          ) : null}
          {problem.retryPick ? (
            <button type="button" className="mcs-undo" disabled={!!filingKey}
              onClick={() => fileMany(problem.retryPick.keys, problem.retryPick.to)}>Try again</button>
          ) : null}
          <button type="button" className="mcs-snack-x" aria-label="Dismiss" onClick={() => setProblem(null)}>✕</button>
        </p>
      ) : (
        <p className="mcs-snack mcs-toast" role="status">
          <span>{typeof toast === "string" ? toast : toast.text}</span>
          {toast && toast.undo ? (
            <button type="button" className="mcs-undo" disabled={!!filingKey}
              onClick={() => undo(toast.undo)}>Undo</button>
          ) : null}
          {toast && toast.more ? (
            <button type="button" className="mcs-undo" onClick={() => { setToast(null); setAddingTo(toast.more); }}>Add more</button>
          ) : null}
        </p>
      )}
    </div>
  ) : null);
  const spec = () => (specifying ? (
    <div className="mcs-spec-scrim">
      <CardSpecification card={specifying} context={specifying} state={state}
        onCommit={onSpecify} onClose={() => setSpecifying(null)} />
    </div>
  ) : null);
  /* FILE SEVERAL OF THEIR OWN THINGS INTO ONE BINDER (prototype curate): one
     existing fileObject per thing, in order, each answered by the server. A
     thing already elsewhere MOVES — only after "Move from … to …?" was
     confirmed. A thing already there is not sent. */
  const fileMany = async (keys, to) => {
    if (pickingRef.current || filingRef.current || !onFileObject) return;
    pickingRef.current = true; setBusy(true); setProblem(null); setToast(null);
    const done = []; const failed = []; let lost = false; let stale = false;
    try {
      for (const key of keys) {
        const o = objectsOf(stateRef.current).find((x) => x.key === key);
        if (!o) { failed.push({ key, why: "it has changed since" }); stale = true; continue; }
        if (o.homeId === to.id) { done.push(o); continue; }      // already there: nothing to send
        const what = o.kind === "goal" ? { goalId: o.thing.id } : { collectorCopyId: o.thing.id };
        try {
          const answer = await onFileObject({ binderId: to.id, ...what });
          if (answer && answer.ok === false) {
            failed.push({ key, why: FILING_REFUSED[answer.refused] || "MetYet would not file it" });
            if (STALE_REFUSALS.has(answer.refused)) stale = true;
          } else done.push(o);
        } catch (error) { failed.push({ key, why: "MetYet lost contact" }); lost = true; }
      }
    } finally { pickingRef.current = false; setBusy(false); }
    if (stale || lost) { if (onRefresh) { try { await onRefresh(); } catch (e) { /* said below */ } } }
    setPicking(null); setPicked(new Set()); setConfirmMove(false);
    setSectionOpen(true); setExpanded(to.id); setListFor(null);
    const moved = done.filter((o) => o.homeId && o.homeId !== to.id);
    const said = done.length ? `${done.length} added to ${to.name}${moved.length ? ` · ${moved.length} moved from another binder` : ""}.` : "";
    if (failed.length) {
      const names = failed.map((f) => { const o = objs.find((x) => x.key === f.key); return o ? nameOf(o) : "a card"; });
      setProblem({ text: `${said ? `${said} ` : ""}${failed.length === 1 ? `${names[0]} couldn't be added` : `${failed.length} couldn't be added (${names.join(", ")})`}: ${failed[0].why}.`,
        retryPick: { keys: failed.map((f) => f.key), to } });
    } else if (done.length) setToast({ text: said, undo: null, more: to });
  };
  const addChooser = () => (addingTo ? (
    <div className="mcs-sheet-scrim" role="dialog" aria-modal="true" aria-label={`Add cards to ${addingTo.name}`}
      onClick={(e) => { if (e.target === e.currentTarget) setAddingTo(null); }}
      onKeyDown={(e) => { if (e.key === "Escape") setAddingTo(null); }}>
      <div className="mcs-sheet mcs-addto">
        <strong>{`Add cards to ${addingTo.name}`}</strong>
        <button type="button" className="mcs-cd-choice mcs-addto-opt" autoFocus
          onClick={() => { const to = addingTo; setAddingTo(null); setPicking(to); setPicked(new Set()); setPickQuery(""); setPickLens("all"); }}>
          <b>Add from My Cards</b><span>Cards you&apos;re looking for or own, already in MetYet.</span></button>
        {onAddCards ? (
          <button type="button" className="mcs-cd-choice mcs-addto-opt"
            onClick={() => { const to = addingTo; setAddingTo(null); onAddCards({ binderId: to.id, name: to.name }); }}>
            <b>Browse new cards</b><span>Find a card, say what it is to you, and it lands here.</span></button>
        ) : null}
        <button type="button" className="mcs-linkish" onClick={() => setAddingTo(null)}>Cancel</button>
      </div>
    </div>
  ) : null);
  const picker = () => {
    if (!picking) return null;
    const to = picking;
    const needle2 = text(pickQuery) ? text(pickQuery).toLowerCase() : null;
    const mine = objs.filter((o) => o.kind === "goal" || o.kind === "copy");
    const already = mine.filter((o) => o.homeId === to.id).length;
    const shownHere = mine.filter((o) => (pickLens === "all" || o.meaning === pickLens) && (!needle2 || (() => {
      const k = described[o.cardKey];
      return [k && k.cardName, k && k.expansionName, k && k.collectorNumber && `#${k.collectorNumber}`, k && k.finish ? versionLabel(k) : null]
        .filter(Boolean).join(" ").toLowerCase().includes(needle2);
    })()));
    const chosen = mine.filter((o) => picked.has(o.key) && o.homeId !== to.id);
    const moving = chosen.filter((o) => o.homeId);
    const from = [...new Set(moving.map((o) => o.homeName))];
    const toggle = (o) => setPicked((p) => { const n = new Set(p); if (n.has(o.key)) n.delete(o.key); else n.add(o.key); return n; });
    const go = () => { if (!chosen.length || busy) return; if (moving.length && !confirmMove) { setConfirmMove(true); return; } fileMany(chosen.map((o) => o.key), to); };
    return (
      <div className="mcs-cd mcs-pick" role="dialog" aria-modal="true" aria-label={`Add to ${to.name}`}>
        <header className="mcs-cd-hd">
          <button type="button" className="mcs-cd-back" onClick={() => { setPicking(null); setConfirmMove(false); }}>‹ Cancel</button>
          <b className="mcs-pick-title">{`Add to ${to.name}`}</b>
        </header>
        <div className="mcs-cd-scroll">
          {already ? <p className="mcs-pick-note">{`${already} already in ${to.name}.`}</p> : null}
          <p className="mcs-find mcs-pick-find">
            <input className="mcs-in" type="search" value={pickQuery} placeholder="Search your cards" aria-label="Search your cards"
              onChange={(e) => setPickQuery(e.target.value)} />
          </p>
          <div className="mcs-lenses mcs-pick-lenses" role="tablist" aria-label="Show">
            {LENSES.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={pickLens === id}
                className={`mcs-view${pickLens === id ? " on" : ""}`} onClick={() => setPickLens(id)}>{label}</button>
            ))}
          </div>
          {!mine.length ? <p className="mcs-dim mcs-bempty">Cards you&apos;re looking for or own will appear here. Find one in Browse.</p>
            : !shownHere.length ? <p className="mcs-dim mcs-bempty">Nothing of yours matches.</p> : (
              <ul className="mcs-ogrid">
                {shownHere.map((o) => {
                  const known = described[o.cardKey] || null;
                  const here = o.homeId === to.id;
                  const on = picked.has(o.key) && !here;
                  const num = known && known.collectorNumber ? `#${known.collectorNumber}` : null;
                  const ident = [[nameOf(o), num].filter(Boolean).join(" "), known && known.finish ? versionLabel(known) : null, o.qual || null].filter(Boolean).join(" · ");
                  return (
                    <li key={o.key} className={`mcs-otile mcs-ptile${on ? " sel" : ""}${here ? " inthis" : ""}`} data-key={o.key}>
                      <button type="button" className="mcs-otap" disabled={here} aria-pressed={here ? undefined : on}
                        aria-label={`${nameOf(o)}, ${MEANING[o.meaning]}, ${here ? "already in this binder" : where(o)}`}
                        onClick={() => { setConfirmMove(false); toggle(o); }}>
                        {here ? null : <span className="mcs-pcheck" aria-hidden="true">{on ? "✓" : ""}</span>}
                        <CardArt src={known && known.imageSmall} name={known && known.cardName}
                          wrap="mcs-otile-art" plate="mcs-art-plate" decorative card={phOf(o, known)} />
                      </button>
                      <span className="mcs-ometa">
                        <span className="mcs-ostate"><StateChip kind={o.meaning} label={MEANING[o.meaning]} /></span>
                        <span className={`mcs-oloc${o.homeId ? (here ? "" : " elsewhere") : " unf"}`}>{here ? "This binder" : where(o)}</span>
                        <span className="mcs-oq">{ident}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          <div className="mcs-cd-spacer" />
        </div>
        <div className="mcs-cd-dock">
          {confirmMove && moving.length ? (
            <div className="mcs-pick-confirm" role="alert">
              <p><b>{`Move from ${from.join(", ")} to ${to.name}?`}</b>
                {` ${moving.length === 1 ? `${nameOf(moving[0])} will` : `${moving.length} cards will`} move here — ${moving.length === 1 ? "it" : "they"} won't stay there too.`}</p>
              <p className="mcs-goal-do">
                <button type="button" className="mcs-go" disabled={busy} onClick={go}>{`Move and add${chosen.length > 1 ? ` ${chosen.length}` : ""}`}</button>
                <button type="button" className="mcs-go quiet" disabled={busy} onClick={() => setConfirmMove(false)}>Back</button>
              </p>
            </div>
          ) : moving.length ? (
            <p className="mcs-cd-hint">{`${moving.length === 1 ? "1 card" : `${moving.length} cards`} will move here from ${from.join(", ")}.`}</p>
          ) : null}
          {confirmMove && moving.length ? null : (
            <button type="button" className={`mcs-cd-add${chosen.length ? " ready" : ""}`} aria-disabled={!chosen.length || busy} aria-busy={busy} onClick={go}>
              {busy ? "Adding…" : chosen.length ? `Add ${chosen.length} to ${to.name}` : `Add to ${to.name}`}</button>
          )}
        </div>
      </div>
    );
  };
  const moveChooser = () => {
    const o = moving && detailKey ? objs.find((x) => x.key === detailKey) || null : null;
    if (!o || naming) return null;
    return (
      <MoveChooser name={nameOf(o)} label={`${nameOf(o)} · ${MEANING[o.meaning]} · now ${o.homeId ? `in ${o.homeName}` : "Unfiled"}`}
        dests={destsFor(o)} onPick={(d) => goTo(o, d)} onCancel={() => setMoving(false)} />
    );
  };
  const namePrompt = () => {
    const o = naming ? objs.find((x) => x.key === naming.key) || null : null;
    if (!naming || !o) return null;
    const cancel = () => { if (!naming.busy) setNaming(null); };
    return (
      <div className="mcs-sheet-scrim mcs-newbin-scrim" role="dialog" aria-modal="true" aria-label="New binder">
        <div className="mcs-sheet">
          <strong>New binder</strong>
          <p className="mcs-dim">{`${nameOf(o)} will go in it.`}</p>
          <input className="mcs-in" value={naming.name} placeholder="Binder name" aria-label="New binder name" disabled={naming.busy} autoFocus
            onChange={(e) => setNaming({ ...naming, name: e.target.value, problem: null })}
            onKeyDown={(e) => { if (e.key === "Enter") moveToNew(naming.key, naming.name); if (e.key === "Escape") cancel(); }} />
          {naming.problem ? <p className="mcs-add-problem" role="alert">{naming.problem}</p> : null}
          <p className="mcs-goal-do">
            <button className="mcs-go" type="button" disabled={naming.busy || !text(naming.name)}
              onClick={() => moveToNew(naming.key, naming.name)}>{naming.busy ? "Making it…" : "Create & move"}</button>
            <button className="mcs-go quiet" type="button" disabled={naming.busy} onClick={cancel}>Cancel</button>
          </p>
        </div>
      </div>
    );
  };
  const heldKnown = held ? described[held.o.cardKey] || null : null;
  const filingLayer = () => (held ? (
    <FilingLayer origin={held.origin} dests={destsFor(held.o)} onDrop={dropOn} onCancel={() => setHeld(null)}
      label={`${nameOf(held.o)} · ${MEANING[held.o.meaning]} · now ${held.o.homeId ? `in ${held.o.homeName}` : "Unfiled"}`}
      art={<CardArt src={heldKnown && heldKnown.imageSmall} name={nameOf(held.o)}
        wrap="mcs-otile-art" plate="mcs-art-plate" decorative card={phOf(held.o, heldKnown)} />} />
  ) : null);
  const renameSheet = renaming ? (
    <div className="mcs-sheet-scrim" role="dialog" aria-label="Rename binder">
      <div className="mcs-sheet">
        <strong>Rename binder</strong>
        <input className="mcs-in" value={renaming.name} aria-label="Binder name" disabled={busy} autoFocus
          onChange={(e) => setRenaming({ id: renaming.id, name: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setRenaming(null); }} />
        <p className="mcs-goal-do">
          <button className="mcs-go" type="button" disabled={busy || !renaming.name.trim()} onClick={saveName}>Save name</button>
          <button className="mcs-go quiet" type="button" disabled={busy} onClick={() => setRenaming(null)}>Cancel</button>
        </p>
      </div>
    </div>
  ) : null;

  /* -------------------------------------------------------- THE SCREEN */
  const shown = visible(objs);
  const unfiledAll = objs.filter((o) => !o.homeId);
  const unfiledShown = visible(unfiledAll);
  const filedMatches = shown.filter((o) => o.homeId && active.some((b) => b.id === o.homeId)).length;
  const matchWord = (n) => `${n} ${n === 1 ? "match" : "matches"}`;

  /* A BINDER, OPENED IN PLACE (P6-3.1). Collapsed: its name, its count, and a
     turn-down. Open: its cards at once, fully interactive — tap, Details,
     press and hold — with what is in it summed up in one line, and a quiet
     "•••" holding everything that manages it. There is no second screen to go
     to: the binder you opened IS the binder. */
  const binderRow = (b, away = false) => {
    const inside = objs.filter((o) => o.homeId === b.id);
    const earlierFiled = earlierIn(b.id);
    const all = [...inside, ...earlierFiled];
    const here = visible(all);
    const isOpen = expanded === b.id;
    const named = text(b.name) || "A binder";
    const counts = LENSES.slice(1).map(([id, label]) => [label, inside.filter((o) => o.meaning === id).length])
      .filter(([, n]) => n);
    const unsorted = inside.filter((o) => o.meaning === "owned").length;
    const menuOpen = isOpen && menuFor === b.id;
    const act = (fn) => () => { setMenuFor(null); fn(); };
    return (
      <div key={b.id} className={`mcs-bcover${isOpen ? " open" : ""}`} data-binder={b.id}>
        <div className="mcs-bhead-row">
          <button type="button" className="mcs-bhead" aria-expanded={isOpen}
            onClick={() => { setExpanded(isOpen ? null : b.id); setMenuFor(null); setListFor(null); }}>
            <span className="mcs-bline"><b>{named}</b>
              <span>{away ? "Put away · " : ""}{plural(all.length, "card", "cards")}</span></span>
            {filtering && !isOpen && all.length ? (
              <span className="mcs-bmatch">{here.length ? matchWord(here.length) : "No matches"}</span>
            ) : null}
          </button>
          {isOpen ? (
            <button className="mcs-more" type="button" aria-label={`Manage ${named}`} aria-haspopup="menu"
              aria-expanded={menuOpen} onClick={() => setMenuFor(menuOpen ? null : b.id)}>•••</button>
          ) : null}
        </div>
        {menuOpen ? (
          <div className="mcs-bmenu" role="menu" aria-label={`Manage ${named}`}>
            {!away && onRenameBinder ? (
              <button role="menuitem" type="button" disabled={busy}
                onClick={act(() => setRenaming({ id: b.id, name: text(b.name) || "" }))}>Rename binder</button>
            ) : null}
            <button role="menuitem" type="button" onClick={act(() => setListFor(listFor === b.id ? null : b.id))}>
              {listFor === b.id ? "Show as cards" : "Move & remove (list)"}
            </button>
            {onArchiveBinder ? (away ? (
              <button role="menuitem" type="button" disabled={busy} onClick={act(() => putAway(b, false))}>Bring back</button>
            ) : (
              <button role="menuitem" type="button" disabled={busy} onClick={act(() => putAway(b, true))}>Put away</button>
            )) : null}
          </div>
        ) : null}
        {isOpen ? (
          <div className="mcs-bbody">
            {all.length || (!away && (onAddCards || onFileObject)) ? (
              <div className="mcs-btools">
                {all.length ? (
                  <p className="mcs-bsum" aria-label="What's here">
                    <b>{plural(all.length, "card", "cards")}</b>
                    {counts.map(([label, n]) => <span key={label}>{` · ${n} ${label}`}</span>)}
                    {unsorted ? <span>{` · ${unsorted} not yet sorted`}</span> : null}
                    {earlierFiled.length ? <span>{` · ${earlierFiled.length} earlier ${earlierFiled.length === 1 ? "filing" : "filings"}`}</span> : null}
                  </p>
                ) : <span />}
                {!away && (onAddCards || onFileObject) ? (
                  <button type="button" className="mcs-linkish mcs-badd"
                    onClick={() => setAddingTo({ id: b.id, name: text(b.name) || "this binder" })}>+ Add cards</button>
                ) : null}
              </div>
            ) : null}
            {listFor === b.id ? (
              <Collection state={state} view={{ kind: "binder", binderId: b.id }} lens={lens}
                query={query} onBrowseCards={onBrowseCards} onSpecify={onSpecify} descriptions={cards}
                onFileObject={onFileObject} onUnfileObject={onUnfileObject} />
            ) : here.length ? grid(here, false) : all.length ? (
              <p className="mcs-dim mcs-bempty">{needle ? noMatch(`in ${named}`) : "Nothing in this binder is in that state."}</p>
            ) : (
              <p className="mcs-dim mcs-bempty">
                Nothing in this binder yet. A binder is where a card belongs — it doesn&apos;t mean you want it or own it.
              </p>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="mcs-binders">
      {spec()}
      {renameSheet}
      {cardEdit()}
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
              <button type="button" className="mcs-newcover" onClick={() => setMaking(true)}>+ New binder</button>
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
      {filingLayer()}
      {moveChooser()}
      {addChooser()}
      {picker()}
      {namePrompt()}
    </div>
  );
}
