/* ============================================================================
   DISCOVER — THE COLLECTOR'S BROWSE (Phase 6 P6-F2)
   Lives beside CardBrowser because both are catalogue browsing; CardBrowser
   stays as it was for the Trusted Partner's Inventory, which this milestone
   does not change. This one is the Phase 6 prototype's BrowseView.
   ========================================================================== */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import CardArt from "../card-art.jsx";
import { useCardDescriptions } from "../collector/card-descriptions.js";

const rows = (v) => (Array.isArray(v) ? v : []);
const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

/* ============================================================================
   P6-F2 — BROWSE, AS THE PHASE 6 PROTOTYPE DRAWS IT (fca2c61 BrowseView)
   One search field; Pokémon / Sets / Artists; a visual Pokédex by generation;
   Pokémon, Set and Artist as CONSTRAINTS that compose in any order, each a
   removable chip; suggestions that refine; a two-column card grid wearing the
   Collector's own marks; more as you scroll. Every row is production's: the
   Pokédex (/api/pokemon), sets (/api/expansions), artists (/api/artists) and
   cards (/api/card-contexts), server-paged — no bundled data, no catalogue
   download. Pressing a card opens the SAME production card experience as
   before (version, then the Card Specification); its full-screen Phase 6 form
   is P6-F3. Browsing writes nothing.
   ========================================================================== */
const PAGE = { cards: 60, pokemon: 60, rows: 50, suggest: 20 };
const TABS = Object.freeze([["pokemon", "Pokémon"], ["sets", "Sets"], ["artists", "Artists"]]);
const SHOWN = { pokemon: 4, set: 4, artist: 3 };   // suggestions per kind, as the prototype
const KIND = { pokemon: "Pokémon", set: "Set", artist: "Artist" };
/* A printed number ("4", "004", "4a", "TG04", "SV001") searches the number;
   anything else searches card names. */
const looksLikeNumber = (t) => /^[A-Za-z]{0,5}[0-9]+[A-Za-z]?$/.test(t);
const qs = (o) => Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "")
  .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
const plural = (n, one, many) => `${Number(n || 0).toLocaleString()} ${n === 1 ? one : many}`;

/* THE BROWSING SESSION, owned by the shell so a trip to another tab and back
   lands where it was: the tab, the generation, the constraints, the text, the
   pages already loaded, and — as presentation memory only — where each view
   was scrolled to. Nothing in it is ever sent anywhere or stored. */
export const newBrowseSession = () => ({ tab: "pokemon", gen: "all", text: "", pokemon: null, set: null, artist: null,
  pages: {}, scroll: {} });

/* Pages of one list, kept in the session under `key`, fetched as needed. */
function usePages({ key, load, browsing, push, enabled }) {
  const entry = browsing.pages[key] || null;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(false);
  const live = useRef(key); live.current = key;
  const fetchPage = async (page) => {
    if (busy) return;
    setBusy(true); setProblem(false);
    const asked = key;
    try {
      const got = await load(page);
      if (live.current !== asked) return;
      push((s) => {
        const held = s.pages[asked];
        const items = page === 1 ? got.items : [...((held && held.items) || []), ...got.items];
        return { ...s, pages: { ...s.pages, [asked]: { items, total: got.total, page, extra: got.extra || (held && held.extra) || null } } };
      });
    } catch (error) {
      if (live.current === asked) setProblem(true);
    } finally { if (live.current === asked) setBusy(false); }
  };
  useEffect(() => { if (enabled && key && !entry) fetchPage(1); }, [key, enabled]);
  return {
    items: entry ? entry.items : [], total: entry ? entry.total : 0, extra: entry ? entry.extra : null,
    loaded: !!entry, busy, problem,
    more: () => { if (entry && entry.items.length < entry.total) fetchPage(entry.page + 1); },
    retry: () => fetchPage(entry ? entry.page + 1 : 1),
  };
}

function Fan({ seed }) {
  /* Three drawn cards, until artwork is approved (register: D4, interim). */
  return (
    <span className="mcs-dfan" aria-hidden="true">
      {[0, 1, 2].map((i) => <CardArt key={i} src={null} name="" wrap="mcs-dfan-art" plate="mcs-art-plate" decorative card={{ key: `${seed}:${i}` }} />)}
    </span>
  );
}

function Markers({ m }) {
  if (!m) return null;
  const chips = [];
  if (m.primary) chips.push(["Primary", "primary"]);
  if (m.secondary) chips.push(["Secondary", "secondary"]);
  if (m.pc) chips.push([m.pc > 1 ? `PC ×${m.pc}` : "PC", "pc"]);
  if (m.tradeSell) chips.push([m.tradeSell > 1 ? `Trade / Sell ×${m.tradeSell}` : "Trade / Sell", "trade"]);
  if (m.owned) chips.push([m.owned > 1 ? `Owned ×${m.owned}` : "Owned", "owned"]);
  if (!chips.length) return null;
  return <span className="mcs-dmarks">{chips.map(([t, c]) => <span key={t} className={`mcs-mk mcs-mk-${c}`}>{t}</span>)}</span>;
}

export default function Discover({ state, browse = null, browsing, onBrowsing, onChoose, chosenId = null, justId = null, busy: opening = false, onCount = null }) {
  const S = browsing;
  /* THE SESSION IS HANDED BACK AS A VALUE, as CardBrowser always has, so any
     host's setter works. Updates are computed from the latest session this
     component knows — including one it handed back a moment ago and that has
     not re-rendered yet — so two pages arriving together do not lose one. */
  const latest = useRef(S);
  latest.current = S;
  const push = (f) => { const next = f(latest.current); latest.current = next; onBrowsing(next); };
  const set = (patch) => push((s) => ({ ...s, ...patch }));
  const needle = text(S.text) || "";      // text() is null for nothing typed
  const active = S.pokemon != null || !!S.set || !!S.artist;
  const showingCards = active || !!needle;
  const summary = [S.pokemon && S.pokemon.name, S.set && S.set.name, S.artist].filter(Boolean).join(" · ");

  /* THE CARDS: every constraint is one more AND on the same catalogue query. */
  const cardsKey = showingCards ? `cards:${JSON.stringify([S.pokemon && S.pokemon.dex, S.set && S.set.id, S.artist, needle])}` : null;
  const cards = usePages({ key: cardsKey, browsing: S, push, enabled: !!browse, load: async (page) => {
    const r = await browse.find(qs({ pokedex: S.pokemon && S.pokemon.dex, expansionId: S.set && S.set.id, artist: S.artist,
      ...(needle ? (looksLikeNumber(needle) ? { number: needle } : { query: needle }) : {}), page, pageSize: PAGE.cards }));
    return { items: rows(r && r.contexts), total: Number(r && r.total) || 0 };
  } });
  /* THE LANDING LISTS. */
  const listKey = showingCards ? null : S.tab === "pokemon" ? `pokemon:${S.gen}` : S.tab;
  const list = usePages({ key: listKey, browsing: S, push, enabled: !!browse, load: async (page) => {
    if (S.tab === "pokemon") {
      const r = await browse.pokemon(qs({ generation: S.gen === "all" ? null : S.gen, page, pageSize: PAGE.pokemon }));
      return { items: rows(r && r.pokemon), total: Number(r && r.total) || 0, extra: { generations: rows(r && r.generations) } };
    }
    const r = S.tab === "sets" ? await browse.expansions(qs({ page, pageSize: PAGE.rows })) : await browse.artists(qs({ page, pageSize: PAGE.rows }));
    return { items: rows(r && (S.tab === "sets" ? r.expansions : r.artists)), total: Number(r && r.total) || 0 };
  } });
  const pager = showingCards ? cards : list;

  /* SUGGESTIONS that would refine what is on screen — the kinds not already
     chosen, starts-with first, then the most cards. Counts are the catalogue's
     own; with a constraint active they are not narrowed to it (register). */
  const [suggestions, setSuggestions] = useState([]);
  useEffect(() => {
    if (!browse || needle.length < 2) { setSuggestions([]); return undefined; }
    let current = true;
    const t = setTimeout(async () => {
      const ask = async (kind) => {
        try {
          if (kind === "pokemon") return rows((await browse.pokemon(qs({ query: needle, pageSize: PAGE.suggest }))).pokemon)
            .map((p) => ({ kind, label: p.name, value: { dex: p.pokedexNumber, name: p.name }, n: p.cardCount }));
          if (kind === "set") return rows((await browse.expansions(qs({ query: needle, pageSize: PAGE.suggest }))).expansions)
            .map((x) => ({ kind, label: x.name, value: { id: x.expansionId, name: x.name }, n: x.cardCount }));
          return rows((await browse.artists(qs({ query: needle, pageSize: PAGE.suggest }))).artists)
            .map((a) => ({ kind, label: a.artist, value: a.artist, n: a.cardCount }));
        } catch (error) { return []; }
      };
      const kinds = ["pokemon", "set", "artist"].filter((k) => (k === "pokemon" ? S.pokemon == null : !S[k]));
      const got = await Promise.all(kinds.map(ask));
      if (!current) return;
      const q = needle.toLowerCase();
      const starts = (x) => (x.label.toLowerCase().startsWith(q) ? 0 : 1);
      setSuggestions(got.flatMap((xs) => xs.filter((x) => x.n > 0).sort((a, b) => starts(a) - starts(b) || b.n - a.n)
        .slice(0, xs.length ? SHOWN[xs[0].kind] : 0)));
    }, 200);
    return () => { current = false; clearTimeout(t); };
  }, [needle, S.pokemon && S.pokemon.dex, S.set && S.set.id, S.artist]);

  /* WHAT IS YOURS, marked on the cards it belongs to. */
  /* ragged rows (a null where a record should be) are skipped, never fatal */
  const goals = rows(state && state.goals).filter(Boolean); const copies = rows(state && state.collectorCopies).filter(Boolean);
  const ids = [...goals, ...copies].map((x) => x.canonicalCardId).filter(Boolean);
  const { described, describe } = useCardDescriptions(browse);
  /* asked for only once cards are on screen: the landing needs none */
  useEffect(() => { if (showingCards) describe(ids); }, [showingCards, ids.join(","), describe]);
  const marks = {};
  const mark = (id, f) => { const d = described[String(id)]; if (!d || !d.cardContextId) return; const m = marks[d.cardContextId] || (marks[d.cardContextId] = {}); f(m); };
  for (const g of goals) mark(g.canonicalCardId, (m) => { if (g.tier === "primary") m.primary = true; else if (g.tier === "secondary") m.secondary = true; });
  for (const c of copies) mark(c.canonicalCardId, (m) => { const k = c.offered === true ? "tradeSell" : c.keeping === true ? "pc" : "owned"; m[k] = (m[k] || 0) + 1; });

  /* The count beside the title, as in the prototype, while cards are shown. */
  useEffect(() => { if (onCount) onCount(showingCards && cards.loaded ? cards.total : null); }, [showingCards, cards.loaded, cards.total]);
  useEffect(() => () => { if (onCount) onCount(null); }, []);

  /* MORE AS YOU SCROLL, and each view comes back where it was left. */
  const viewKey = cardsKey || listKey;
  const pagerRef = useRef(pager); pagerRef.current = pager;
  useLayoutEffect(() => {
    if (typeof window === "undefined" || !window.scrollTo) return;
    window.scrollTo(0, S.scroll[viewKey] || 0);
  }, [viewKey]);
  useEffect(() => {
    if (typeof window === "undefined" || !window.addEventListener) return undefined;
    const onScroll = () => {
      S.scroll[viewKey] = window.scrollY;   // presentation memory only
      const doc = document.documentElement;
      if (window.innerHeight + window.scrollY > doc.scrollHeight - 700) pagerRef.current.more();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [viewKey]);

  const chips = [
    S.pokemon != null && ["pokemon", `Pokémon: ${S.pokemon.name}`],
    S.set && ["set", `Set: ${S.set.name}`],
    S.artist && ["artist", `Artist: ${S.artist}`],
  ].filter(Boolean);
  const pick = (sg) => set({ [sg.kind]: sg.value, text: "" });
  const footer = (p) => (p.problem ? (
    <p className="mcs-dempty" role="alert">MetYet&rsquo;s card list could not be reached.{" "}
      <button type="button" className="mcs-linkish" onClick={p.retry}>Try again</button></p>
  ) : p.items.length < p.total ? (
    <button type="button" className="mcs-dmore" onClick={p.more} disabled={p.busy}>
      {p.busy ? "Loading more…" : `Scroll for more · ${(p.total - p.items.length).toLocaleString()} more`}</button>
  ) : null);
  const gens = (list.extra && list.extra.generations) || [];

  return (
    <div className="mcs-disc">
      <div className="mcs-dsearch">
        <input className="mcs-dsearch-in" aria-label="Search" value={S.text} autoComplete="off" inputMode="search"
          placeholder={active ? "Narrow by name or #" : "Search Pokémon, sets, artists or cards"}
          onChange={(e) => set({ text: e.target.value })} />
        {S.text ? <button type="button" className="mcs-dclear" aria-label="Clear search" onClick={() => set({ text: "" })}>×</button> : null}
      </div>
      {chips.length ? (
        <div className="mcs-dchips" aria-label="Showing">
          {chips.map(([k, label]) => (
            <button key={k} type="button" className="mcs-dchip" aria-label={`Remove ${label}`} onClick={() => set({ [k]: null })}>
              {label} <span aria-hidden="true">×</span></button>))}
          <button type="button" className="mcs-dchip clearall" onClick={() => set({ pokemon: null, set: null, artist: null, text: "" })}>Clear all</button>
        </div>
      ) : null}
      {suggestions.length ? (
        <ul className="mcs-dsugg" aria-label="Suggestions">
          {suggestions.map((sg) => (
            <li key={`${sg.kind}:${sg.label}`}><button type="button" onClick={() => pick(sg)}>
              <span className="sk">{KIND[sg.kind]}</span> <b>{sg.label}</b> <span className="sn">{plural(sg.n, "card", "cards")}</span></button></li>))}
        </ul>
      ) : null}

      {!showingCards ? (
        <>
          <nav className="mcs-dtabs" role="tablist" aria-label="Browse by">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={S.tab === id} className={S.tab === id ? "on" : ""}
                onClick={() => set({ tab: id })}>{label}</button>))}
          </nav>
          {S.tab === "pokemon" ? (
            <>
              <div className="mcs-dgens" role="tablist" aria-label="Generation">
                {["all", ...gens].map((g) => (
                  <button key={g} type="button" role="tab" aria-selected={String(S.gen) === String(g)}
                    className={String(S.gen) === String(g) ? "on" : ""} onClick={() => set({ gen: g })}>
                    {g === "all" ? "All" : `Gen ${g}`}</button>))}
              </div>
              <ul className="mcs-dtiles">
                {list.items.map((p) => (
                  <li key={p.pokedexNumber}>
                    <button type="button" className="mcs-dtile" data-dex={p.pokedexNumber}
                      onClick={() => set({ pokemon: { dex: p.pokedexNumber, name: p.name }, text: "" })}>
                      <CardArt src={p.face && p.face.imageSmall} name={p.face && p.face.cardName} wrap="mcs-dtile-art" plate="mcs-art-plate" decorative
                        card={{ key: p.face && p.face.cardContextId, set: p.face && p.face.expansionName, number: p.face && p.face.collectorNumber }} />
                      <b>{p.name}</b><span>{plural(p.cardCount, "card", "cards")}</span>
                    </button>
                  </li>))}
              </ul>
            </>
          ) : (
            <ul className="mcs-drows">
              {list.items.map((x) => {
                const isSet = S.tab === "sets";
                const name = isSet ? x.name : x.artist;
                const sub = isSet ? [(text(x.releaseDate) || "").slice(0, 4), x.series, plural(x.cardCount, "card", "cards")].filter(Boolean).join(" · ")
                  : plural(x.cardCount, "card", "cards");
                return (
                  <li key={isSet ? x.expansionId : x.artist}>
                    <button type="button" className="mcs-drow"
                      onClick={() => set(isSet ? { set: { id: x.expansionId, name: x.name }, text: "" } : { artist: x.artist, text: "" })}>
                      <Fan seed={isSet ? x.expansionId : x.artist} />
                      <span className="mcs-drow-t"><b>{name}</b><span>{sub}</span></span>
                    </button>
                  </li>);
              })}
            </ul>
          )}
          {!list.loaded && list.busy ? <p className="mcs-dempty">Looking…</p> : null}
          {list.loaded && !list.items.length ? <p className="mcs-dempty">MetYet&rsquo;s card list has nothing here yet.</p> : null}
          {footer(list)}
        </>
      ) : (
        <>
          {!cards.loaded && cards.busy ? <p className="mcs-dempty">Looking…</p> : null}
          {cards.loaded && !cards.items.length ? (
            <p className="mcs-dempty">{needle ? `Nothing matches “${needle}”${summary ? ` in ${summary}` : ""}.` : "No cards here."}
              {/* The grid searches card names and numbers; a set or an artist
                  is found through its suggestion (register: B15). */}
              {needle && suggestions.length ? " Choose a suggestion above to see its cards." : ""}</p>
          ) : null}
          <ul className="mcs-dgrid">
            {cards.items.map((row) => (
              <li key={row.cardContextId}>
                <button type="button" className={`mcs-dcell${chosenId === row.cardContextId ? " on" : ""}${justId === row.cardContextId ? " just" : ""}`} disabled={opening}
                  aria-label={`${row.cardName}, ${[row.expansionName, row.collectorNumber ? `#${row.collectorNumber}` : null].filter(Boolean).join(" ")}`}
                  onClick={() => onChoose(row, cards.items, [summary, needle ? `“${needle}”` : null].filter(Boolean).join(" · ") || "Browse")}>
                  <CardArt src={row.imageSmall} name={row.cardName} wrap="mcs-dcell-art" plate="mcs-art-plate" decorative
                    card={{ key: row.cardContextId, set: row.expansionName, number: row.collectorNumber }} />
                  <span className="mcs-dcap"><span>{row.expansionName}</span><span>{row.collectorNumber ? `#${row.collectorNumber}` : ""}</span></span>
                  <Markers m={marks[row.cardContextId]} />
                </button>
              </li>))}
          </ul>
          {footer(cards)}
        </>
      )}
    </div>
  );
}

