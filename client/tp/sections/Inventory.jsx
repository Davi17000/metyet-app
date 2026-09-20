/* ============================================================================
   INVENTORY — WHAT YOU HAVE, COPY BY PHYSICAL COPY

   Every row here is one InventoryCopy: one physical card, with its own `invId`,
   its own certificate, its own acquisition cost and its own status. That is the
   whole design of this screen, and the reason it is not a list of CARDS with
   quantities.

   ACQUISITION COST BELONGS TO THE COPY, AND ONLY TO THE COPY. It is read as
   `copy.cost` from the row being rendered — never looked up by `cardId`, never
   averaged, never taken from another copy of the same card. Three PSA 9
   Charizards bought at £3,100, £3,276 and £3,400 are three different numbers
   against three different rows, and a screen that showed one of them three
   times would be lying about money. A test holds exactly that case.

   It is also TP-private. It reaches this browser because the server projects a
   partner's OWN inventory rows in full (INVENTORY_FOR_COLLECTOR strips `cost`
   and `acquired` for everybody else). It is labelled as yours, and it is never
   combined with the ask into a margin: this product does not compute profit,
   and a number nobody sent is not a number to show. The catalogue's own `value`
   field is deliberately not rendered either — its meaning is not established as
   a market price, and presenting it as one would be inventing pricing.

   STATUS IS THE SERVER'S ANSWER. Available, committed, reserved, sold, traded —
   the server derives it from every opportunity under the domain's rules, and
   the row carries the result. This file does not look at opportunities and work
   it out. A second implementation of a rule is a second answer to it.

   RAW OR GRADED IS THE CATALOGUE'S ANSWER, TOO. `grade` carries a grading label
   or the word "Raw"; `condition` qualifies a raw copy and is null for a graded
   one. Both are shown when present and neither is inferred from the other — a
   copy whose catalogue entry did not arrive still renders, because it is still
   a copy you own.

   TWO VIEWS, ONE WORKSPACE. What you hold, and the shop a collector sees you
   as. They belong together: the profile is what makes a shelf of copies mean
   something to somebody in your network, which is why it is reached from here
   rather than from a settings destination of its own. `View shop` moves between
   them and changes nothing.

   THE SHOP VIEW IS THE SAME COMPONENT AS EVER. This file renders `<Profile/>`
   and hands it the callback it was given; it does not reimplement a profile, a
   form, or a way to save one. There is one profile implementation in this
   product and this is not a second. Nothing here reaches a store, names a
   command or goes to the network — the callback arrived as a prop.
   ========================================================================== */

import React, { useEffect, useMemo, useState } from "react";
import { Panel, Record, Fact, Tag } from "../parts.jsx";
import { rows, indexById, text, day, money, plural, cardTitle, cardSetLine,
  gradeLine, isGraded, cardMarks, statusLabel, byRecency } from "../present.js";
import Profile from "./Profile.jsx";

export default function Inventory({ state, onSaveProfile = null,
  onAddCopy = null, onBrowseCards = null }) {
  /* Local to this screen, and nothing else's business. It is not a route, not a
     section id, and nothing outside this file can be pointed at it. */
  const [viewing, setViewing] = useState("copies");

  const inventory = rows(state && state.inventory);
  const catalog = indexById(state && state.catalog);

  const live = byRecency(inventory.filter((i) => !i.archived), "addedAt", "acquired");
  const archived = inventory.length - live.length;

  /* WHICH CARD EACH COPY IS (Batch 6). A copy stores one thing about its card:
     the id the server minted. Everything a person reads — the name, the
     release, the number, the finish — is asked for in ONE request for the ids
     this screen already holds, never one per row and never the catalogue. A
     copy whose description has not arrived still renders: it is still a copy
     you own, and an id is not a name. */
  const canonicalIds = useMemo(() => [...new Set(live.map((i) => i.canonicalCardId).filter(Boolean))],
    [live.map((i) => i.canonicalCardId).join(",")]);
  const [described, setDescribed] = useState({});
  useEffect(() => {
    if (!onBrowseCards || !canonicalIds.length) return undefined;
    let current = true;
    (async () => {
      try {
        const answer = await onBrowseCards.describe(canonicalIds);
        if (!current) return;
        const next = {};
        for (const card of rows(answer && answer.cards)) next[card.canonicalCardId] = card;
        setDescribed((held) => ({ ...held, ...next }));
      } catch (error) { /* a shelf without captions is still a shelf */ }
    })();
    return () => { current = false; };
  }, [canonicalIds.join(","), onBrowseCards]);

  /* THE ADD FLOW, as small as it can be and still be honest: find a checklist
     entry, choose the exact printing when there is a choice, say what is true
     about the physical card, save. `null` means the flow is closed. */
  const [adding, setAdding] = useState(null);
  const closeAdd = () => setAdding(null);

  if (viewing === "shop") {
    return (
      <>
        <p className="tps-crumb">
          <button className="tps-back" type="button" onClick={() => setViewing("copies")}>
            ← Back to inventory
          </button>
        </p>
        <Profile state={state} onSave={onSaveProfile} />
      </>
    );
  }

  return (
    <Panel
      title="Your copies"
      note={live.length ? plural(live.length, "copy", "copies") : null}
      action={
        <>
          {onAddCopy && onBrowseCards && !adding ? (
            <button className="tps-edit" type="button" onClick={() => setAdding({})}>Add a copy</button>
          ) : null}
          <button className="tps-edit" type="button" onClick={() => setViewing("shop")}>View shop</button>
        </>}
      empty={live.length ? null
        : (archived
          ? "Nothing on your shelf right now — every copy you've recorded is archived."
          : "Nothing in your inventory yet. Adding a copy isn't part of this release.")}
    >
      {adding ? (
        <AddCopy
          browse={onBrowseCards}
          onAdd={onAddCopy}
          onDone={closeAdd}
        />
      ) : null}
      {live.map((copy) => {
        /* A copy names its card one way or the other. A canonical one is
           described by the server; a legacy one is the demo catalogue's. */
        const known = copy.canonicalCardId ? described[copy.canonicalCardId] : null;
        const card = copy.canonicalCardId ? null : (catalog.get(copy.cardId) || null);
        /* Grade and condition belong to the COPY since Batch 5 — a PSA 9 and a
           PSA 10 of one printing are one card and two copies. */
        const grade = text(copy.grade) || (card ? gradeLine(card) : null);
        const graded = Boolean(grade) && !/^raw$/i.test(grade);
        const shown = graded ? grade
          : (text(copy.condition) ? `${grade || "Raw"} · ${copy.condition}` : grade);
        return (
          <Record
            key={copy.invId}
            title={(known && known.cardName) || cardTitle(card)
              || (copy.canonicalCardId ? "Loading this card…" : "A card not in your catalogue")}
            subtitle={known
              ? [known.expansionName, known.collectorNumber ? `#${known.collectorNumber}` : null]
                .filter(Boolean).join(" · ") || null
              : cardSetLine(card)}
            marks={known
              ? [known.finish, known.printRun, known.language].filter(Boolean)
              : cardMarks(card)}
            tags={
              <>
                <Tag>{shown}</Tag>
                <Tag tone={copy.status === "available" ? null : "strong"}>{statusLabel(copy.status)}</Tag>
              </>
            }
            facts={
              <>
                {/* The certificate is the copy's, not the card's. */}
                <Fact label={graded ? "Cert" : "Serial"} value={text(copy.cert)} mono />
                <Fact label="Ask" value={money(copy.ask)} mono />
                {/* THIS copy's cost. Read from this row, by construction. */}
                <Fact label="Your cost" value={money(copy.cost)} mono />
                <Fact label="Acquired" value={day(copy.acquired)} mono />
                <Fact label="Added" value={day(copy.addedAt)} mono />
              </>
            }
          />
        );
      })}
      {archived ? (
        <p className="tps-foot-note">
          {plural(archived, "archived copy is", "archived copies are")} not shown.
        </p>
      ) : null}
    </Panel>
  );
}

/* ============================================================================
   ADDING A COPY

   FOUR STEPS, AND THE THIRD ONE DISAPPEARS WHEN IT HAS NOTHING TO ASK. Find a
   checklist entry; choose the exact printing IF the entry has more than one;
   say what is true about the physical card; save. A context with a single
   selectable card goes straight to the details, because a chooser with one
   option is a question nobody asked.

   THE BROWSER NAMES A CARD, IT NEVER DESCRIBES ONE. What leaves here is a
   `canonicalCardId` the server minted and this screen merely received, plus
   facts about an object on a shelf. There is no field for a card's name, set,
   number or finish, and no field for a partner: ownership comes from the
   authenticated actor and a payload that carried one would be ignored.

   EVERY WAY THIS CAN FAIL SAYS SO. A search that finds nothing, a context with
   nothing selectable, a catalogue that cannot be reached, a card withdrawn
   between choosing it and saving, and a refusal from the domain are five
   different sentences, because they are five different situations and only
   some of them are the person's to fix. */
function AddCopy({ browse, onAdd, onDone }) {
  const [query, setQuery] = useState("");
  const [looking, setLooking] = useState(false);
  const [results, setResults] = useState(null);
  const [context, setContext] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [facts, setFacts] = useState({ grade: "", condition: "", ask: "", cost: "", cert: "" });
  const [problem, setProblem] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setFacts((f) => ({ ...f, [k]: v }));

  const find = async (event) => {
    if (event && event.preventDefault) event.preventDefault();
    const term = String(query).trim();
    if (!term) return;
    setProblem(null); setLooking(true); setResults(null);
    try {
      const answer = await browse.find(`query=${encodeURIComponent(term)}&pageSize=20`);
      setResults(rows(answer && answer.contexts));
    } catch (error) {
      setProblem("The card catalogue could not be reached. Try again in a moment.");
    } finally { setLooking(false); }
  };

  const open = async (row) => {
    setProblem(null); setLooking(true);
    try {
      const answer = await browse.read(row.cardContextId);
      const cards = rows(answer && answer.canonicalCards);
      setContext({ ...row, cards });
      /* One version is not a choice. */
      setChosen(cards.length === 1 ? cards[0] : null);
      if (!cards.length) setProblem("MetYet has no version of this card to add yet.");
    } catch (error) {
      setProblem("That card could not be read. Try again in a moment.");
    } finally { setLooking(false); }
  };

  const save = async () => {
    if (!chosen || saving) return;
    setSaving(true); setProblem(null);
    try {
      const answer = await onAdd({
        canonicalCardId: chosen.canonicalCardId,
        grade: facts.grade || null,
        condition: facts.grade === "Raw" ? (facts.condition || null) : null,
        ask: facts.ask === "" ? null : Number(facts.ask),
        cost: facts.cost === "" ? null : Number(facts.cost),
        cert: facts.cert || null,
      });
      if (answer && answer.ok === false) {
        setProblem(answer.refused === "card-unavailable"
          ? "That version is no longer one MetYet can add. Choose another."
          : answer.refused === "invalid-amount"
            ? "An amount has to be a number, and not a negative one."
            : "MetYet would not accept that copy. Check the details and try again.");
        setSaving(false);
        return;
      }
      onDone();
    } catch (error) {
      setProblem("MetYet lost contact, so it cannot tell whether that copy was added. Re-open your inventory before trying again.");
      setSaving(false);
    }
  };

  const field = (label, key, extra = {}) => (
    <label className="tps-field">
      <span>{label}</span>
      <input value={facts[key]} onChange={(e) => set(key, e.target.value)} {...extra} />
    </label>
  );

  return (
    <div className="tps-add">
      <div className="tps-add-head">
        <strong>Add a copy</strong>
        <button className="tps-edit" type="button" onClick={onDone}>Cancel</button>
      </div>

      {!context ? (
        <>
          <form onSubmit={find}>
            <label className="tps-field">
              <span>Find a card</span>
              <input value={query} autoFocus type="search" placeholder="Charizard"
                onChange={(e) => setQuery(e.target.value)} />
            </label>
            <button className="tps-edit" type="submit" disabled={looking}>
              {looking ? "Looking…" : "Search"}
            </button>
          </form>
          {results && !results.length ? (
            <p className="tps-foot-note">
              No card by that name. MetYet&apos;s catalogue is still being filled, so a
              card that exists may not be here yet.
            </p>
          ) : null}
          {rows(results).map((row) => (
            <button key={row.cardContextId} className="tps-add-row" type="button"
              onClick={() => open(row)}>
              <span>{row.cardName}</span>
              <span className="tps-dim">
                {[row.expansionName, row.collectorNumber ? `#${row.collectorNumber}` : null]
                  .filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
        </>
      ) : (
        <>
          <p className="tps-add-card">
            <strong>{context.cardName}</strong>
            <span className="tps-dim">
              {[context.expansionName, context.collectorNumber ? `#${context.collectorNumber}` : null]
                .filter(Boolean).join(" · ")}
            </span>
            <button className="tps-edit" type="button"
              onClick={() => { setContext(null); setChosen(null); setProblem(null); }}>
              Choose a different card
            </button>
          </p>

          {context.cards.length > 1 ? (
            <div className="tps-add-versions">
              <span>Which version?</span>
              {context.cards.map((card) => (
                <button key={card.canonicalCardId} type="button"
                  className={"tps-add-row" + (chosen && chosen.canonicalCardId === card.canonicalCardId ? " on" : "")}
                  onClick={() => setChosen(card)}>
                  {[card.finish, card.printRun, card.language].filter(Boolean).join(" · ")}
                </button>
              ))}
            </div>
          ) : null}

          {chosen ? (
            <>
              <label className="tps-field">
                <span>Grade</span>
                <select value={facts.grade} onChange={(e) => set("grade", e.target.value)}>
                  <option value="">Not stated</option>
                  {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              {facts.grade === "Raw" ? (
                <label className="tps-field">
                  <span>Condition</span>
                  <select value={facts.condition} onChange={(e) => set("condition", e.target.value)}>
                    <option value="">Not stated</option>
                    {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              ) : null}
              {field("Certificate", "cert", { inputMode: "numeric" })}
              {field("Ask", "ask", { inputMode: "decimal" })}
              {field("What it cost you", "cost", { inputMode: "decimal" })}
              <button className="tps-edit" type="button" disabled={saving} onClick={save}>
                {saving ? "Adding…" : "Add this copy"}
              </button>
            </>
          ) : null}
        </>
      )}

      {problem ? <p className="tps-add-problem" role="alert">{problem}</p> : null}
    </div>
  );
}

/* The grading vocabulary the domain already has. Not a list this screen
   invented, and deliberately not widened here: another grading company is a
   product decision, not a dropdown. */
const GRADES = ["Raw", "PSA 1", "PSA 2", "PSA 3", "PSA 4", "PSA 5", "PSA 6",
  "PSA 7", "PSA 8", "PSA 9", "PSA 10"];
const CONDITIONS = ["Near Mint", "Lightly Played", "Moderately Played",
  "Heavily Played", "Damaged"];
