/* ============================================================================
   THE CARD BROWSER — ONE WAY IN, COMPOSED DIFFERENTLY BY EACH SEAT (Phase 5 C1)

   Both seats had a card picker and neither shared a line with the other: a
   hundred and ten byte-identical lines in two files, one under `collector/` and
   one under `tp/`, each about to grow a gallery. This is that picker, once.

   WHAT IT DOES AND WHERE IT STOPS. It knows the three doorways, the grid, the
   paging and the browsing session. It does not know what a card is being chosen
   FOR: it hands the chosen card context back and the caller decides whether
   that becomes something a Collector is looking for or something a Trusted
   Partner has on the shelf. Shared plumbing, not shared meaning — which is why
   there is no command in this file and no way to reach one.

   THE THREE DOORWAYS, AND WHY THEY ARE THESE THREE. A person looking for a card
   does not arrive holding its id. They arrive knowing a Pokémon, a set, or an
   artist, and each of those is a different shape of question:

     Pokémon   type a name, or give a National Pokédex number. The name is a
               substring now — "zard" finds Charizard, which is what a person
               half-remembering a card actually types.
     Set       pick from the releases there are, newest first. A set is a place
               you browse, not a word you have to spell.
     Artist    pick from the artists there are. Somebody who loves one
               illustrator's work is looking for the illustrator, not the card.

   IMAGE-FORWARD, AND HONEST WHEN THERE IS NO IMAGE. The server sends one
   representative picture per card context — the first printing of that artwork
   that has one. A context with none draws its name instead, at the same size,
   so a grid of half-illustrated cards is still a grid and not a row of holes.

   THE BROWSING SESSION IS THE CALLER'S. Doorway, search text, which set or
   artist is open, the page, and the rows themselves live in `session`, which
   the caller owns and this component never resets. That is what makes
   "browse → open a card → come back" land where you were: nothing here
   unmounts, so the scroll position is the browser's own and needs no
   restoring. A caller that keeps the session above its own section keeps the
   position across a trip to another part of the product too.

   NOTHING HERE IS DURABLE. Browsing writes nothing, chooses nothing, and
   creates no record of any kind — not a draft, not a bookmark, not a queue.
   Looking at a card is not wanting it, and the only thing that leaves this
   component is a card context the caller asked for.
   ========================================================================== */

import React, { useCallback, useEffect, useState } from "react";
import CardArt from "../card-art.jsx";

const rows = (v) => (Array.isArray(v) ? v : []);
const text = (v) => (typeof v === "string" ? v.trim() : "");
const PAGE = 24;

export const EMPTY_SESSION = Object.freeze({
  doorway: "pokemon",
  query: "",
  pokedex: "",
  expansionId: null,
  expansionName: null,
  artist: null,
  page: 1,
  results: null,
  sets: null,
  artists: null,
});

export const DOORWAYS = Object.freeze([
  { id: "pokemon", label: "Pokémon" },
  { id: "set", label: "Set" },
  { id: "artist", label: "Artist" },
]);

/* The query string for a session, which is also the definition of what each
   doorway MEANS. One place, so the grid and the paging can never disagree. */
export function browseQuery(session, page = session.page) {
  const parts = [`page=${Math.max(1, Number(page) || 1)}`, `pageSize=${PAGE}`];
  if (session.doorway === "pokemon") {
    if (text(session.query)) parts.push(`query=${encodeURIComponent(text(session.query))}`);
    if (text(session.pokedex)) parts.push(`pokedex=${encodeURIComponent(text(session.pokedex))}`);
  }
  if (session.doorway === "set" && session.expansionId) {
    parts.push(`expansionId=${encodeURIComponent(session.expansionId)}`);
  }
  if (session.doorway === "artist" && session.artist) {
    parts.push(`artist=${encodeURIComponent(session.artist)}`);
  }
  return parts.join("&");
}

/* A doorway is ready to show cards when it has been given something to narrow
   by. The Pokémon doorway with an empty box is a person who has not asked yet,
   and showing them the whole catalog in release order is not an answer. */
const asked = (s) => (s.doorway === "pokemon" ? !!(text(s.query) || text(s.pokedex))
  : s.doorway === "set" ? !!s.expansionId : !!s.artist);

export default function CardBrowser({ browse, prefix = "mcs", session, onSession,
  onChoose, chosenId = null, busy = false, fastAdd = true }) {
  const p = (suffix) => `${prefix}-${suffix}`;
  const [looking, setLooking] = useState(false);
  const [problem, setProblem] = useState(null);
  const patch = useCallback((next) => onSession({ ...session, ...next }), [session, onSession]);

  /* THE ONE FETCH, driven by the session rather than by a button, so a page
     change, a doorway change and a search all arrive the same way. */
  const query = asked(session) ? browseQuery(session) : null;
  useEffect(() => {
    if (!browse || !query) return undefined;
    let current = true;
    setLooking(true); setProblem(null);
    (async () => {
      try {
        const answer = await browse.find(query);
        if (!current) return;
        onSession({ ...session, results: answer || null });
      } catch (error) {
        if (current) setProblem("MetYet's card list could not be reached. Try again in a moment.");
      } finally { if (current) setLooking(false); }
    })();
    return () => { current = false; };
    /* The query IS the dependency: the session holds the answer too, and
       depending on the whole of it would refetch its own result. */
  }, [query, browse]);

  /* The two doorways that are lists of their own. Each is asked for once, when
     its doorway is first opened, and kept for the rest of the session. */
  useEffect(() => {
    if (!browse || session.doorway !== "set" || session.sets) return undefined;
    let current = true;
    (async () => {
      try {
        const answer = await browse.expansions("pageSize=100");
        if (current) onSession({ ...session, sets: rows(answer && answer.expansions) });
      } catch (error) { if (current) setProblem("MetYet's list of sets could not be reached."); }
    })();
    return () => { current = false; };
  }, [session.doorway, session.sets, browse]);

  useEffect(() => {
    if (!browse || session.doorway !== "artist" || session.artists) return undefined;
    let current = true;
    (async () => {
      try {
        const answer = await browse.artists("pageSize=100");
        if (current) onSession({ ...session, artists: rows(answer && answer.artists) });
      } catch (error) { if (current) setProblem("MetYet's list of artists could not be reached."); }
    })();
    return () => { current = false; };
  }, [session.doorway, session.artists, browse]);

  const found = session.results;
  const contexts = rows(found && found.contexts);
  const total = Number(found && found.total) || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const doorway = (id) => patch({ doorway: id, page: 1, results: null });
  const submit = (event) => { if (event && event.preventDefault) event.preventDefault(); };

  return (
    <div className={p("br")}>
      <nav className={p("br-doors")} aria-label="Browse by">
        {DOORWAYS.map((d) => (
          <button key={d.id} type="button" aria-pressed={session.doorway === d.id}
            className={`${p("br-door")}${session.doorway === d.id ? " on" : ""}`}
            onClick={() => doorway(d.id)}>{d.label}</button>
        ))}
      </nav>

      {session.doorway === "pokemon" ? (
        <form className={p("br-find")} onSubmit={submit}>
          <label className={p("br-lab")} htmlFor={`${prefix}-br-q`}>Pokémon or card name</label>
          <input id={`${prefix}-br-q`} className={p("br-in")} value={session.query}
            placeholder="Charizard" autoComplete="off"
            onChange={(e) => patch({ query: e.target.value, page: 1 })} />
          <label className={p("br-lab")} htmlFor={`${prefix}-br-n`}>Pokédex number</label>
          <input id={`${prefix}-br-n`} className={`${p("br-in")} n`} value={session.pokedex}
            placeholder="6" inputMode="numeric" autoComplete="off"
            onChange={(e) => patch({ pokedex: e.target.value.replace(/[^0-9]/g, ""), page: 1 })} />
        </form>
      ) : null}

      {session.doorway === "set" ? (
        <Chooser prefix={prefix} label="Sets" items={session.sets}
          open={session.expansionId}
          idOf={(s) => s.expansionId}
          labelOf={(s) => s.name}
          noteOf={(s) => [s.series, s.cardCount ? `${s.cardCount} cards` : null].filter(Boolean).join(" · ")}
          onPick={(s) => patch({ expansionId: s ? s.expansionId : null,
            expansionName: s ? s.name : null, page: 1, results: null })} />
      ) : null}

      {session.doorway === "artist" ? (
        <Chooser prefix={prefix} label="Artists" items={session.artists}
          open={session.artist}
          idOf={(a) => a.artist}
          labelOf={(a) => a.artist}
          noteOf={(a) => (a.cardCount ? `${a.cardCount} cards` : null)}
          onPick={(a) => patch({ artist: a ? a.artist : null, page: 1, results: null })} />
      ) : null}

      {problem ? <p className={p("add-problem")} role="alert">{problem}</p> : null}

      {!asked(session) ? (
        <p className={p("br-empty")}>
          {session.doorway === "pokemon" ? "Type a Pokémon or a card name to start looking."
            : session.doorway === "set" ? "Choose a set to see what is in it."
              : "Choose an artist to see what they drew."}
        </p>
      ) : looking && !contexts.length ? (
        <p className={p("br-empty")}>Looking…</p>
      ) : !contexts.length ? (
        <p className={p("br-empty")}>
          Nothing matches that yet. MetYet&rsquo;s card list is still being filled.
        </p>
      ) : (
        <>
          <p className={p("br-count")}>{total === 1 ? "1 card" : `${total} cards`}</p>
          <ul className={p("br-grid")}>
            {contexts.map((row) => (
              <li key={row.cardContextId}
                className={`${p("br-cell")}${chosenId === row.cardContextId ? " on" : ""}`}>
                <button type="button" className={p("br-card")} disabled={busy}
                  onClick={() => onChoose(row)}>
                  <CardArt src={row.imageSmall} name={row.cardName}
                    wrap={p("br-art")} plate={p("br-plate")} />
                  <span className={p("br-name")}>{row.cardName}</span>
                  <span className={p("br-sub")}>
                    {[row.expansionName, row.collectorNumber ? `#${row.collectorNumber}` : null]
                      .filter(Boolean).join(" · ")}
                  </span>
                </button>
                {/* THE FAST PATH, AND ONLY WHERE IT MEANS SOMETHING (C1). A
                    Collector pressing `+` is saying "this one, guide me" — the
                    card and its `+` end in the same panel. A Trusted Partner
                    has no fast path to a copy whose grade, condition and price
                    nobody has entered, so their browser is handed `fastAdd`
                    false and the control is not rendered at all rather than
                    hidden with a stylesheet. */}
                {fastAdd ? (
                  <button type="button" className={p("br-plus")} disabled={busy}
                    aria-label={`Add ${row.cardName}`} onClick={() => onChoose(row)}>+</button>
                ) : null}
              </li>
            ))}
          </ul>
          {pages > 1 ? (
            <p className={p("br-pager")}>
              <button type="button" className={p("br-page")} disabled={session.page <= 1 || looking}
                onClick={() => patch({ page: session.page - 1 })}>Previous</button>
              <span className={p("br-pos")}>Page {session.page} of {pages}</span>
              <button type="button" className={p("br-page")} disabled={session.page >= pages || looking}
                onClick={() => patch({ page: session.page + 1 })}>Next</button>
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

/* A list of sets, or a list of artists. One shape, because "narrow to one of
   these" is one interaction however it is labelled. */
function Chooser({ prefix, label, items, open, idOf, labelOf, noteOf, onPick }) {
  const p = (suffix) => `${prefix}-${suffix}`;
  if (items === null || items === undefined) return <p className={p("br-empty")}>Loading {label.toLowerCase()}…</p>;
  if (open) {
    const it = rows(items).find((x) => idOf(x) === open);
    return (
      <p className={p("br-open")}>
        <strong>{it ? labelOf(it) : open}</strong>
        <button type="button" className={p("br-back")} onClick={() => onPick(null)}>
          Choose a different {label.toLowerCase().replace(/s$/, "")}
        </button>
      </p>
    );
  }
  if (!rows(items).length) return <p className={p("br-empty")}>MetYet has no {label.toLowerCase()} listed yet.</p>;
  return (
    <ul className={p("br-list")}>
      {rows(items).map((it) => (
        <li key={idOf(it)}>
          <button type="button" className={p("add-row")} onClick={() => onPick(it)}>
            <strong>{labelOf(it)}</strong>
            {noteOf(it) ? <span className={p("br-note")}>{noteOf(it)}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
