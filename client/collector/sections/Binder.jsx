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
            className={`mcs-dest${hover === d.id ? " over" : ""}${d.off ? " off" : ""}${d.id === "cancel" ? " cancel" : ""}`}
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

/* THE FOUR STATES, IN THE TWO PAIRS THE DOMAIN ACTUALLY HAS (P6-4).
   Primary and Secondary are a GOAL's tier — a card you are looking for — and
   change with `updateGoalTier`. PC and Trade / Sell are an OWNED COPY's
   disposition and change with `setCollectorCopyKept` / `setCollectorCopyOffered`.
   A Goal and a copy are different objects: there is no command that turns one
   into the other, and composing one (add, file, remove) could half-succeed and
   deletes a record — so the sheet never does it. A tap across the pairs
   explains instead, and points at the full card, where a copy can be recorded
   or a Goal started beside this one. */
const STATE_PAIRS = Object.freeze([
  { kind: "goal", title: "Looking for it", states: [["primary", "Primary", "Actively hunting"], ["secondary", "Secondary", "Keeping an eye out"]] },
  { kind: "copy", title: "Own it", states: [["pc", "PC", "Keeping it"], ["trade", "Trade / Sell", "Open to moving it"]] },
]);
const ACROSS = Object.freeze({
  goal: "PC and Trade / Sell describe a copy you own. This is a card you're looking for, and MetYet won't turn it into a copy. If you've got one, record it from the full card — this Goal stays until you remove it.",
  copy: "Primary and Secondary are Goals — cards you're looking for. This is a copy you own, and MetYet won't turn it into a Goal. To look for another copy, start a Goal from the full card.",
});
/* What the server's refusal means for a state change, in a sentence. */
const STATE_REFUSED = Object.freeze({
  "goal-locked": "This Goal is part of an active deal, so it stays Primary until that deal ends. Nothing was changed.",
  "not-found": "This has changed since the screen was drawn. The latest is shown now; nothing was changed.",
  "not-owner": "That isn't yours to change.",
});
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
  /* THE CARD SHEET (P6-4): a state change in flight (one at a time, guarded by
     a ref for the same reason filing is), its confirmation once the server has
     answered, a tap across the pairs being explained, the binder list, and the
     card's secondary facts — each shown only when asked for. */
  const [changing, setChanging] = useState(null);   // { key, to }
  const changingRef = useRef(null);
  const [stateAck, setStateAck] = useState(null);   // { key, to }
  const [across, setAcross] = useState(null);       // key of the object whose cross-pair tap is explained
  const [stateProblem, setStateProblem] = useState(null);
  const [moving, setMoving] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const openSheet = (key) => {
    setDetailKey(key); setAcross(null); setStateProblem(null); setStateAck(null); setMoving(false); setMoreOpen(false);
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
  useEffect(() => {
    if (!stateAck) return undefined;
    const t = setTimeout(() => setStateAck(null), 2500);
    return () => clearTimeout(t);
  }, [stateAck]);
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
  const fileTo = async (o, dest, undoing = false) => {
    if (filingRef.current || changingRef.current || !filable(o)) return false;
    const to = dest || null;
    if (to === (o.homeId || null)) return false;
    const what = o.kind === "goal" ? { goalId: o.thing.id } : { collectorCopyId: o.thing.id };
    const from = o.homeId || null;
    filingRef.current = o.key; setFilingKey(o.key); setProblem(null); setToast(null);
    try {
      const answer = to ? await onFileObject({ binderId: to, ...what }) : await onUnfileObject(what);
      if (answer && answer.ok === false) {
        setProblem(FILING_REFUSED[answer.refused] || "MetYet would not file that. Nothing was changed.");
        if (STALE_REFUSALS.has(answer.refused) && onRefresh) { try { await onRefresh(); } catch (e) { /* said already */ } }
        return false;
      }
      setLandedKey(o.key);
      const name = nameOf(o);
      /* UNDO IS THE SAME COMMANDS, BACKWARDS — offered only where they can
         work: back to Unfiled, or back into a binder that is still in use. A
         home that has been put away cannot take a card back, so no undo is
         promised there; Move is. */
      const back = from === null || active.some((b) => b.id === from) ? { key: o.key, to: from } : null;
      setToast({ text: undoing ? `Put back: ${name} is ${to ? `in ${binderName(to)}` : "Unfiled"} again.`
        : to ? `${name} is filed in ${binderName(to)}.` : `${name} is Unfiled now.`, undo: undoing ? null : back });
      return true;
    } catch (error) {
      setProblem("MetYet lost contact, so it can't tell whether that was filed. Check this card before trying again.");
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

  /* A CARD THAT IS GONE ON RE-READ takes its sheet with it — and the reason
     moves to the bar, so the sheet never just vanishes unexplained. */
  useEffect(() => {
    if (!detailKey || objs.some((x) => x.key === detailKey)) return;
    setDetailKey(null);
    setProblem(stateProblem || "That card has changed elsewhere and is no longer here. The latest is shown.");
    setStateProblem(null);
  }, [objs, detailKey, stateProblem]);

  /* ONE STATE CHANGE, ONE EXISTING COMMAND, SAID WHEN THE SERVER HAS ANSWERED.
     Only within a pair; never across it (see STATE_PAIRS). */
  const pairOf = (m) => (m === "primary" || m === "secondary" ? "goal" : "copy");
  const changeState = async (o, to) => {
    setAcross(null); setStateProblem(null);
    if (pairOf(to) !== o.kind) { setStateAck(null); setAcross(o.key); return false; }
    if (to === o.meaning || changingRef.current || filingRef.current || !onSpecify) return false;
    const step = o.kind === "goal" ? { kind: "how-hard", goalId: o.thing.id, tier: to }
      : to === "pc" ? { kind: "keeping", copyId: o.thing.id, keeping: true }
        : { kind: "offering", copyId: o.thing.id, offered: true };
    changingRef.current = o.key; setChanging({ key: o.key, to }); setStateAck(null);
    try {
      const answer = await onSpecify(step, o.thing.canonicalCardId || null);
      if (answer && answer.ok === false) {
        setStateProblem(STATE_REFUSED[answer.refused] || "MetYet would not make that change. Nothing was changed.");
        if (STALE_REFUSALS.has(answer.refused) && onRefresh) { try { await onRefresh(); } catch (e) { /* said already */ } }
        return false;
      }
      setStateAck({ key: o.key, to });
      return true;
    } catch (error) {
      setStateProblem("MetYet lost contact, so it can't tell whether that changed. The latest is shown — check before trying again.");
      if (onRefresh) { try { await onRefresh(); } catch (e) { /* said already */ } }
      return false;
    } finally {
      changingRef.current = null; setChanging(null);
    }
  };
  const hold = useHold((o, origin) => {
    if (!filable(o) || specifying || detailKey || renaming || filingRef.current || changingRef.current) return;
    setHeld({ o, origin });
  });
  const dropOn = (d) => {
    const o = held && held.o; setHeld(null);
    if (!o) return;
    if (d === "unfiled") fileTo(o, null);
    else if (d.startsWith("b:")) fileTo(o, d.slice(2));
  };
  const destsFor = (o) => [
    ...active.map((b) => ({ id: `b:${b.id}`, label: text(b.name) || "A binder",
      sub: b.id === o.homeId ? "Current binder" : null, off: b.id === o.homeId })),
    ...(o.homeId ? [{ id: "unfiled", label: "Unfiled", sub: `Take it out of ${o.homeName}` }] : []),
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


  /* ONE TILE (P6-3.1): the picture first and largest; then the card's name
     and number; then why it matters (state) beside its own grade or wanted
     grade; then, quietly, where it lives, its set and version. Everything else
     — cert, value, photos, status, its Binder choice — is one tap away in
     Details, never laid out under every card. Render helpers are called as
     functions, not components defined inside the render (which React would
     remount on every keystroke). */
  const tile = (o, showHome = true) => {
    const known = described[o.cardKey] || null;
    const go = openCard(o);
    const name = nameOf(o);
    const num = known && known.collectorNumber ? `#${known.collectorNumber}` : null;
    const sub = [showHome ? where(o) : null, known && text(known.expansionName), known && known.finish]
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
          <span className="mcs-oname">{name}{num ? <span className="mcs-onum">{` ${num}`}</span> : null}</span>
          <span className="mcs-ostate">
            <span className={`mcs-mk mcs-mk-${o.meaning}`}>{MEANING[o.meaning]}</span>
            {o.qual ? <span className="mcs-oqual">{o.qual}</span> : null}
          </span>
          {sub ? <span className="mcs-oq">{sub}</span> : null}
          {status ? <span className="mcs-ostatus">{status}</span> : null}
          {conflict ? <span className="mcs-oconflict">{`Says ${conflict}`}</span> : null}
          {filingKey === o.key ? <span className="mcs-ostatus" role="status">Filing…</span> : null}
          {changing && changing.key === o.key ? <span className="mcs-ostatus" role="status">Saving…</span> : null}
        </span>
      </li>
    );
  };
  const grid = (list, showHome = true) => (
    <ul className="mcs-ogrid">{list.map((o) => tile(o, showHome))}</ul>
  );

  /* THE CARD SHEET (P6-4, from Phase 6's object sheet). One Goal or copy:
     the card, then what it is to you (four states, in the two pairs the
     domain has), then where it lives, then — only when asked — its facts and
     the full card. Nothing changes until a choice is tapped, and nothing is
     said to have changed until the server has answered. */
  const detailsSheet = () => {
    const o = detailKey ? objs.find((x) => x.key === detailKey) || null : null;
    if (!o) return null;
    const known = described[o.cardKey] || null;
    const name = nameOf(o);
    const copy = o.kind === "copy" ? o.thing : null;
    const goal = o.kind === "goal" ? o.thing : null;
    const go = openCard(o);
    const conflict = copy ? gradeConflictLine(copy) : null;
    const close = () => { setDetailKey(null); setMoving(false); };
    const busyNow = !!changing || !!filingKey;
    const ident = [known && text(known.expansionName), known && known.collectorNumber ? `#${known.collectorNumber}` : null,
      known && known.finish].filter(Boolean).join(" · ");
    const others = active.filter((b) => b.id !== o.homeId);
    const ack = stateAck && stateAck.key === o.key && o.meaning === stateAck.to ? stateAck.to : null;
    return (
      <div className="mcs-sheet-scrim mcs-osheet-scrim" role="dialog" aria-modal="true" aria-label={`Card: ${name}`}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        onKeyDown={(e) => { if (e.key === "Escape") close(); }}>
        <div className="mcs-sheet mcs-osheet">
          <button type="button" className="mcs-x" aria-label="Close" onClick={close} autoFocus>✕</button>
          <div className="mcs-ohero">
            <CardArt src={known && known.imageSmall} name={known && known.cardName}
              wrap="mcs-ohero-art" plate="mcs-art-plate" decorative card={phOf(o, known)} />
          </div>
          <div className="mcs-oident">
            <h2>{name}</h2>
            {ident ? <p>{ident}</p> : null}
          </div>

          <section className="mcs-osect" aria-label="What is this card to you?">
            <h3>What is this card to you?</h3>
            {STATE_PAIRS.map((pair) => (
              <div key={pair.kind} className={`mcs-opair${pair.kind === o.kind ? "" : " other"}`}>
                <span className="mcs-opair-t">{pair.title}</span>
                <div className="mcs-states" role="group" aria-label={pair.title}>
                  {pair.states.map(([m, label, sub]) => {
                    const on = o.meaning === m;
                    const saving = changing && changing.key === o.key && changing.to === m;
                    const mine = pair.kind === o.kind;
                    return (
                      <button key={m} type="button" data-meaning={m}
                        className={`mcs-state${on ? " on" : ""}${saving ? " saving" : ""}${ack === m ? " justset" : ""}${mine ? "" : " across"}`}
                        aria-pressed={on} aria-disabled={!mine || busyNow ? true : undefined}
                        onClick={() => (busyNow ? null : changeState(o, m))}>
                        <b>{label}</b><span>{saving ? "Saving…" : sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {o.meaning === "owned" ? (
              <p className="mcs-dim mcs-onote">You haven&apos;t said yet whether you&apos;re keeping this copy or open to moving it.</p>
            ) : null}
            <p className={`mcs-stateack${ack ? " on" : ""}`} role="status" aria-live="polite">{ack ? `✓ Now ${MEANING[ack]}` : ""}</p>
            {stateProblem ? <p className="mcs-add-problem" role="alert">{stateProblem}</p> : null}
            {across === o.key ? (
              <div className="mcs-across" role="note">
                <p>{ACROSS[o.kind]}</p>
                <p className="mcs-goal-do">
                  {go ? <button className="mcs-go" type="button" onClick={() => { close(); go(); }}>Open full card</button> : null}
                  <button className="mcs-go quiet" type="button" onClick={() => setAcross(null)}>OK</button>
                </p>
              </div>
            ) : null}
            <p className="mcs-oconfig"><span>{goal ? "Looking for" : "Grade"}</span>
              <b>{goal ? criteriaLine(goal.desired) || "Any grade or condition" : o.qual || "Not stated"}</b></p>
            {conflict ? <p className="mcs-oconflict">{`Says ${conflict}`}</p> : null}
          </section>

          {filable(o) ? (
            <section className="mcs-osect" aria-label="Binder">
              <h3>Binder</h3>
              <p className="mcs-ohome">
                {o.homeId ? `In ${o.homeName}${o.homeAway ? " (put away)" : ""}` : "Unfiled"}
                {filingKey === o.key ? <span className="mcs-dim" role="status">{" · Filing…"}</span> : null}
              </p>
              {!moving ? (
                <p className="mcs-oacts">
                  {others.length ? (
                    <button type="button" className="mcs-go quiet" disabled={busyNow} aria-expanded={false}
                      onClick={() => setMoving(true)}>{o.homeId ? "Move to another binder" : "Put in a binder"}</button>
                  ) : null}
                  {o.homeId ? (
                    <button type="button" className="mcs-go quiet" disabled={busyNow}
                      onClick={() => fileTo(o, null)}>{`Take out of ${o.homeName}`}</button>
                  ) : null}
                </p>
              ) : (
                <div className="mcs-omove" role="group" aria-label={`Binder for ${name}`}>
                  {o.homeId ? <p className="mcs-dim">{`It will move from ${o.homeName} — it won't stay there too.`}</p> : null}
                  {others.map((b) => (
                    <button key={b.id} type="button" className="mcs-ochoice" disabled={busyNow}
                      onClick={() => { setMoving(false); fileTo(o, b.id); }}>{text(b.name) || "A binder"}</button>
                  ))}
                  <button type="button" className="mcs-linkish" onClick={() => setMoving(false)}>Cancel</button>
                </div>
              )}
              <p className="mcs-dim mcs-onote">A binder is where it belongs. Moving it doesn&apos;t change what it is to you.</p>
            </section>
          ) : null}

          <section className="mcs-osect">
            <button type="button" className="mcs-omore" aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)}>
              {copy ? "Copy details" : "Goal details"}
            </button>
            {moreOpen ? (
              <div className="mcs-detail-facts">
                {copy ? (
                  <>
                    <Fact label={isGraded(copy) ? "Cert" : "Serial"} value={text(copy.cert)} />
                    <Fact label="Your reference value" value={money(copy.market)} />
                    <Fact label="Added" value={day(copy.addedAt)} />
                    <Fact label="Photos" value={photoNote(copy.photos)} />
                    <Fact label="Status" value={statusLabel(copy.status)} />
                  </>
                ) : (
                  <Fact label="Looking for" value={criteriaLine(goal && goal.desired) || "any grade or condition"} />
                )}
              </div>
            ) : null}
            {go ? (
              <button type="button" className="mcs-linkish mcs-ofull" onClick={() => { close(); go(); }}>
                Open full card — grade, copies, and more ›</button>
            ) : null}
          </section>
        </div>
      </div>
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
    <div className="mcs-snack-wrap">
      {problem ? (
        <p className="mcs-snack warn" role="alert">
          <span>{problem}</span>
          <button type="button" className="mcs-snack-x" aria-label="Dismiss" onClick={() => setProblem(null)}>✕</button>
        </p>
      ) : (
        <p className="mcs-snack mcs-toast" role="status">
          <span>{typeof toast === "string" ? toast : toast.text}</span>
          {toast && toast.undo ? (
            <button type="button" className="mcs-undo" disabled={!!filingKey}
              onClick={() => undo(toast.undo)}>Undo</button>
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
            {all.length || (!away && onAddCards) ? (
              <div className="mcs-btools">
                {all.length ? (
                  <p className="mcs-bsum" aria-label="What's here">
                    <b>{plural(all.length, "card", "cards")}</b>
                    {counts.map(([label, n]) => <span key={label}>{` · ${n} ${label}`}</span>)}
                    {unsorted ? <span>{` · ${unsorted} not yet sorted`}</span> : null}
                    {earlierFiled.length ? <span>{` · ${earlierFiled.length} earlier ${earlierFiled.length === 1 ? "filing" : "filings"}`}</span> : null}
                  </p>
                ) : <span />}
                {!away && onAddCards ? (
                  <button type="button" className="mcs-linkish mcs-badd"
                    onClick={() => onAddCards({ binderId: b.id, name: b.name })}>+ Add cards</button>
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
      {detailsSheet()}
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
    </div>
  );
}
