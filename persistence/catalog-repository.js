/* ============================================================================
   THE CARD CATALOG REPOSITORY (Phase 5 Batch 5)

     catalog.putExpansion(expansion)        -> { expansionId, created }
     catalog.putCardContext(context)        -> { cardContextId, created }
     catalog.putCanonicalCard(card)         -> { canonicalCardId, created }
     catalog.recordSourceMapping(mapping)   -> { sourceMappingId, status }
     catalog.withdrawCanonicalCard(id)      -> boolean
     catalog.findCardContexts(query)        -> { contexts, page, pageSize, total }
     catalog.readCardContext(id)            -> { context, canonicalCards } | null
     catalog.readCanonicalCard(id)          -> card | null

   NOT THE WORLD REPOSITORY, AND THE DIFFERENCE IS THE POINT. That one loads
   every canonical record, validates the lot as one state, and writes under a
   single advisory lock, because a command changes several records at once and
   they must agree. Nothing here does any of that. A card is a fact about the
   world outside MetYet; importing one does not have to agree with anything a
   person did. So these calls take no lock, load nothing they were not asked
   for, and a search touches one table.

   IDENTITY IS MINTED HERE AND NOWHERE ELSE, and it is opaque. Not a provider's
   id, not a hash of the card's dimensions, not derived from anything at all. A
   natural key is the question "do I already have this?", asked once per upsert
   and answered by a unique index; an id is the answer to "which card is this?",
   asked by every Goal, every Inventory copy and every Binder entry for as long
   as MetYet exists. Making the second a function of the first would mean that
   correcting a translation — deciding a card is a fourth print rather than
   unlimited — silently became a different card, and every record pointing at it
   would be pointing at nothing. So an upsert that finds a row updates its
   dimensions IN PLACE and keeps the id.

   NOTHING HERE IS DELETED. A source that stops listing a card marks it
   withdrawn. Somebody may be hunting for it.
   ========================================================================== */

const CI = require("../domain/card-identity.js");

const text = (value) => (typeof value === "string" ? value.trim() : "");
const orNull = (value) => (text(value) ? text(value) : null);
const list = (value) => (Array.isArray(value) ? value : []);

/* A page a person could plausibly look at, and a ceiling a caller cannot argue
   with. A search that wants the whole catalog is an import, not a search. */
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

const CONTEXT_FIELDS = ["card_context_id", "expansion_id", "collector_number", "card_name",
  "discriminator", "artist", "rarity", "supertype", "subtypes", "pokedex_numbers"];
/* Qualified explicitly rather than cleverly: these selects join the expansions
   table, and an unqualified column list is how a join starts being ambiguous. */
const contextColumns = (alias) => CONTEXT_FIELDS.map((f) => `${alias}.${f}`).join(", ");
const CARD_COLUMNS = `canonical_card_id, card_context_id, print_run, finish, language,
  stamp, print_variation, image_small, image_large, status`;

const contextRow = (r) => ({
  cardContextId: r.card_context_id,
  expansionId: r.expansion_id,
  collectorNumber: r.collector_number,
  cardName: r.card_name,
  discriminator: r.discriminator,
  artist: r.artist,
  rarity: r.rarity,
  supertype: r.supertype,
  subtypes: list(r.subtypes),
  pokedexNumbers: list(r.pokedex_numbers),
});

const cardRow = (r) => ({
  canonicalCardId: r.canonical_card_id,
  cardContextId: r.card_context_id,
  printRun: r.print_run,
  finish: r.finish,
  language: r.language,
  stamp: r.stamp,
  printVariation: r.print_variation,
  imageSmall: r.image_small,
  imageLarge: r.image_large,
  status: r.status,
});

const expansionRow = (r) => ({
  expansionId: r.expansion_id,
  game: r.game,
  code: r.code,
  name: r.name,
  series: r.series,
  releaseDate: r.release_date,
  printedTotal: r.printed_total,
});

function createCatalogRepository(db, { newId } = {}) {
  if (!db || typeof db.transaction !== "function") {
    throw new TypeError("createCatalogRepository: a database is required");
  }
  /* Ids come from the runtime like every other id in MetYet, so a test can make
     them scripted and production makes them random. The prefixes are for a
     human reading a log; nothing parses them. */
  const mint = (prefix) => {
    if (typeof newId !== "function") throw new TypeError("createCatalogRepository: newId is required");
    return newId(prefix);
  };

  const run = async (sql, params = [], { tx } = {}) => {
    if (tx) return (await tx.query(sql, params)).rows;
    return db.transaction(async (t) => (await t.query(sql, params)).rows);
  };
  /* Every read is a read-only transaction and NONE of them takes the world
     lock. Browsing cards is not something that happens to the world. */
  const read = async (sql, params = []) =>
    db.transaction(async (t) => (await t.query(sql, params)).rows, { readOnly: true });

  return {
    /* ------------------------------------------------------------ WRITES */

    /* One release. Idempotent on its natural key: importing the same expansion
       twice updates its descriptive fields and keeps its id. */
    async putExpansion(expansion, { tx } = {}) {
      const game = text(expansion && expansion.game);
      const code = text(expansion && expansion.code);
      const naturalKey = CI.expansionNaturalKey({ game, code });
      const name = text(expansion && expansion.name);
      if (!name) throw new TypeError("catalog: an expansion needs a name");
      const found = await run(
        "select expansion_id from metyet_catalog.expansions where natural_key = $1", [naturalKey], { tx });
      if (found.length) {
        await run(`update metyet_catalog.expansions
            set name = $2, series = $3, release_date = $4, printed_total = $5
            where expansion_id = $1`,
          [found[0].expansion_id, name, orNull(expansion.series), orNull(expansion.releaseDate),
            expansion.printedTotal == null ? null : Number(expansion.printedTotal)], { tx });
        return { expansionId: found[0].expansion_id, created: false };
      }
      const expansionId = mint("xp");
      await run(`insert into metyet_catalog.expansions
          (expansion_id, game, code, natural_key, name, series, release_date, printed_total)
          values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [expansionId, game, code, naturalKey, name, orNull(expansion.series),
          orNull(expansion.releaseDate),
          expansion.printedTotal == null ? null : Number(expansion.printedTotal)], { tx });
      return { expansionId, created: true };
    },

    /* One checklist entry. The natural key carries the card name, because a
       release may reprint several cards under one number. */
    async putCardContext(context, { tx } = {}) {
      const naturalKey = CI.cardContextNaturalKey(context);
      const found = await run(
        "select card_context_id from metyet_catalog.card_contexts where natural_key = $1",
        [naturalKey], { tx });
      /* Presentation may be corrected freely; the id never moves, which is what
         a test means by "an opaque id does not change because a label did". */
      const presentation = [orNull(context.artist), orNull(context.rarity), orNull(context.supertype),
        JSON.stringify(list(context.subtypes)), JSON.stringify(list(context.pokedexNumbers))];
      if (found.length) {
        await run(`update metyet_catalog.card_contexts
            set artist = $2, rarity = $3, supertype = $4, subtypes = $5::jsonb,
                pokedex_numbers = $6::jsonb, updated_at = now()
            where card_context_id = $1`, [found[0].card_context_id, ...presentation], { tx });
        return { cardContextId: found[0].card_context_id, created: false };
      }
      const cardContextId = mint("cx");
      await run(`insert into metyet_catalog.card_contexts
          (card_context_id, expansion_id, collector_number, card_name, discriminator,
           natural_key, artist, rarity, supertype, subtypes, pokedex_numbers)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)`,
        [cardContextId, text(context.expansionId), text(context.collectorNumber),
          text(context.cardName), text(context.discriminator), naturalKey, ...presentation], { tx });
      return { cardContextId, created: true };
    },

    /* One collectible printing. The vocabulary is judged before anything is
       written, so an unrecognised word cannot reach a row through this door —
       the translation boundary is where an unmappable SOURCE record is dealt
       with, and it never calls this. */
    async putCanonicalCard(card, { tx } = {}) {
      const dimensions = CI.withDefaults(card);
      CI.assertVocabulary(dimensions);
      const cardContextId = text(card && card.cardContextId);
      const naturalKey = CI.canonicalCardNaturalKey({ cardContextId, ...dimensions });
      const images = [orNull(card.imageSmall), orNull(card.imageLarge)];
      const found = await run(
        "select canonical_card_id from metyet_catalog.canonical_cards where natural_key = $1",
        [naturalKey], { tx });
      if (found.length) {
        /* Seeing a card again is what makes it current, so a re-import revives
           one that was withdrawn without minting a second identity for it. */
        await run(`update metyet_catalog.canonical_cards
            set image_small = $2, image_large = $3, status = 'active', updated_at = now()
            where canonical_card_id = $1`, [found[0].canonical_card_id, ...images], { tx });
        return { canonicalCardId: found[0].canonical_card_id, created: false };
      }
      const canonicalCardId = mint("cc");
      await run(`insert into metyet_catalog.canonical_cards
          (canonical_card_id, card_context_id, print_run, finish, language, stamp,
           print_variation, natural_key, image_small, image_large)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [canonicalCardId, cardContextId, dimensions.printRun, dimensions.finish,
          dimensions.language, dimensions.stamp, dimensions.printVariation, naturalKey,
          ...images], { tx });
      return { canonicalCardId, created: true };
    },

    /* Where a row came from. A mapped record names a canonical card; a
       quarantined one deliberately does not, so nothing can match it. */
    async recordSourceMapping(mapping, { tx } = {}) {
      const provider = text(mapping && mapping.provider);
      const providerCardId = text(mapping && mapping.providerCardId);
      const providerVariantKey = text(mapping && mapping.providerVariantKey);
      const status = text(mapping && mapping.status);
      if (!provider || !providerCardId) {
        throw new TypeError("catalog: a source mapping needs its provider and card id");
      }
      if (!["mapped", "quarantined", "withdrawn"].includes(status)) {
        throw new TypeError(`catalog: unknown mapping status "${status}"`);
      }
      const values = [provider, orNull(mapping.providerExpansionId), providerCardId,
        providerVariantKey, orNull(mapping.expansionId), orNull(mapping.cardContextId),
        orNull(mapping.canonicalCardId), JSON.stringify(mapping.raw || {}), status,
        orNull(mapping.quarantineReason)];
      const found = await run(`select source_mapping_id from metyet_catalog.source_mappings
          where provider = $1 and provider_card_id = $2 and provider_variant_key = $3`,
        [provider, providerCardId, providerVariantKey], { tx });
      if (found.length) {
        await run(`update metyet_catalog.source_mappings
            set provider_expansion_id = $2, expansion_id = $3, card_context_id = $4,
                canonical_card_id = $5, raw = $6::jsonb, status = $7,
                quarantine_reason = $8, last_seen_at = now()
            where source_mapping_id = $1`,
          [found[0].source_mapping_id, values[1], values[4], values[5], values[6],
            values[7], values[8], values[9]], { tx });
        return { sourceMappingId: found[0].source_mapping_id, status };
      }
      const sourceMappingId = mint("sm");
      await run(`insert into metyet_catalog.source_mappings
          (source_mapping_id, provider, provider_expansion_id, provider_card_id,
           provider_variant_key, expansion_id, card_context_id, canonical_card_id,
           raw, status, quarantine_reason)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
        [sourceMappingId, ...values], { tx });
      return { sourceMappingId, status };
    },

    /* A source stopped listing it. The row stays, its id stays, and anything
       already pointing at it keeps working. */
    async withdrawCanonicalCard(canonicalCardId, { tx } = {}) {
      const rows = await run(`update metyet_catalog.canonical_cards
          set status = 'withdrawn', updated_at = now()
          where canonical_card_id = $1 returning canonical_card_id`,
        [text(canonicalCardId)], { tx });
      return rows.length > 0;
    },

    /* ------------------------------------------------------------- READS
       Every one of these is read-only and takes no world lock. Browsing cards
       is not a thing that happens to the world. */

    /* THE BROWSE QUERY. Contexts, not canonical cards: a grid wants one tile per
       piece of artwork, not the same picture once per finish.

       THE THREE DOORWAYS (Phase 5 C1). A person looking for a card does not
       arrive knowing its id, and usually does not arrive knowing its exact
       name either. They arrive knowing a Pokémon, a set, or an artist, and
       these are those three questions:

         pokedex     the Pokémon, by its number. A context may list more than
                     one — a card showing two of them is found by either.
         expansion   the set, by the name a person types or the code printed on
                     the card. `expansionId` is still accepted for a caller that
                     already holds one, and is the only one of the two that is
                     exact.
         artist      who drew it. Whole-string, because an artist's name is a
                     name and a half-match is a different person.

       AND THE NAME BECAME A SUBSTRING, which it was not. "zard" did not find
       Charizard, which is not what a search box means anywhere else, and is
       exactly what somebody does when they half-remember a card. A leading
       wildcard cannot use the btree index; at this catalog's size — tens of
       thousands of contexts, and a page of at most a hundred — that is a scan
       of a few milliseconds, and migration 0010 says what to do if it ever
       stops being. Correctness first, and the index is still there for the
       ordering and for anything that asks a prefix question later.

       A PICTURE COMES BACK WITH EACH ROW, which is what makes a grid a grid.
       The image lives on the canonical card, not the context — one piece of
       artwork, several printings of it — so a representative one is chosen:
       the first active printing that has an image, ordered by id so the same
       context always shows the same picture. A context with no images yields
       null and the caller draws the card's name instead. */
    async findCardContexts({ query, expansionId, expansion, artist, pokedex,
      page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
      const size = Math.min(Math.max(Number(pageSize) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
      const at = Math.max(Number(page) || 1, 1);
      const where = [];
      const params = [];
      /* Each `$?` in a clause takes the next value, in order. A clause that
         asks two questions of one word — a set by its name or by its code —
         passes that word twice rather than reaching back into the array it
         just appended to. */
      const add = (clause, ...values) => {
        where.push(clause.replace(/\$\?/g, () => { params.push(values.shift()); return `$${params.length}`; }));
      };
      if (text(query)) add("lower(c.card_name) like '%' || $? || '%'", text(query).toLowerCase());
      if (text(expansionId)) add("c.expansion_id = $?", text(expansionId));
      if (text(expansion)) {
        add("(lower(e.name) like '%' || $? || '%' or lower(e.code) = $?)",
          text(expansion).toLowerCase(), text(expansion).toLowerCase());
      }
      if (text(artist)) add("lower(c.artist) = $?", text(artist).toLowerCase());
      /* A number, or nothing. A pokedex number that is not a number would
         otherwise reach the database as `[null]` and quietly match nothing. */
      if (Number.isFinite(Number(pokedex)) && text(pokedex)) {
        add("c.pokedex_numbers @> $?::jsonb", JSON.stringify([Number(pokedex)]));
      }
      const clause = where.length ? `where ${where.join(" and ")}` : "";
      const from = `from metyet_catalog.card_contexts c
         join metyet_catalog.expansions e on e.expansion_id = c.expansion_id`;
      const totalRows = await read(`select count(*)::int as n ${from} ${clause}`, params);
      const rows = await read(
        `select ${contextColumns("c")}, e.name as expansion_name, e.code as expansion_code,
                art.image_small, art.image_large
         ${from}
         left join lateral (
           select k.image_small, k.image_large
           from metyet_catalog.canonical_cards k
           where k.card_context_id = c.card_context_id and k.status = 'active'
             and k.image_small is not null
           order by k.canonical_card_id limit 1) art on true
         ${clause}
         order by e.code, c.collector_number, c.card_name
         limit ${size} offset ${(at - 1) * size}`, params);
      return {
        contexts: rows.map((r) => ({ ...contextRow(r),
          expansionName: r.expansion_name, expansionCode: r.expansion_code,
          imageSmall: r.image_small || null, imageLarge: r.image_large || null })),
        page: at, pageSize: size, total: totalRows.length ? totalRows[0].n : 0,
      };
    },

    /* THE SET DOORWAY'S OWN LIST (Phase 5 C1). Browsing by set means seeing
       which sets there are, which is a question about expansions rather than
       about cards. The count is how many pieces of artwork are on that
       release's checklist — not how many printings, which is a different and
       larger number nobody browsing is asking about. */
    async findExpansions({ query, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
      const size = Math.min(Math.max(Number(pageSize) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
      const at = Math.max(Number(page) || 1, 1);
      const params = [];
      let clause = "";
      if (text(query)) {
        params.push(text(query).toLowerCase(), text(query).toLowerCase());
        clause = "where lower(e.name) like '%' || $1 || '%' or lower(e.code) like '%' || $2 || '%'";
      }
      const totalRows = await read(
        `select count(*)::int as n from metyet_catalog.expansions e ${clause}`, params);
      const rows = await read(
        `select e.expansion_id, e.game, e.code, e.name, e.series, e.release_date,
                e.printed_total,
                (select count(*)::int from metyet_catalog.card_contexts c
                  where c.expansion_id = e.expansion_id) as context_count
         from metyet_catalog.expansions e
         ${clause}
         order by e.release_date desc nulls last, e.code
         limit ${size} offset ${(at - 1) * size}`, params);
      return {
        expansions: rows.map((r) => ({
          expansionId: r.expansion_id, game: r.game, code: r.code, name: r.name,
          series: r.series, releaseDate: r.release_date,
          printedTotal: r.printed_total, cardCount: r.context_count,
        })),
        page: at, pageSize: size, total: totalRows.length ? totalRows[0].n : 0,
      };
    },

    /* THE ARTIST DOORWAY'S OWN LIST (Phase 5 C1). An artist is not a record in
       this catalog — it is a column on a context — so the list is the distinct
       values, with how many pieces each of them drew. Contexts with no artist
       are left out rather than gathered under a blank name. */
    async findArtists({ query, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
      const size = Math.min(Math.max(Number(pageSize) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
      const at = Math.max(Number(page) || 1, 1);
      const params = [];
      let extra = "";
      if (text(query)) { params.push(text(query).toLowerCase()); extra = "and lower(c.artist) like '%' || $1 || '%'"; }
      const clause = `where c.artist is not null and c.artist <> '' ${extra}`;
      const totalRows = await read(
        `select count(distinct c.artist)::int as n from metyet_catalog.card_contexts c ${clause}`, params);
      const rows = await read(
        `select c.artist, count(*)::int as context_count
         from metyet_catalog.card_contexts c
         ${clause}
         group by c.artist
         order by c.artist
         limit ${size} offset ${(at - 1) * size}`, params);
      return {
        artists: rows.map((r) => ({ artist: r.artist, cardCount: r.context_count })),
        page: at, pageSize: size, total: totalRows.length ? totalRows[0].n : 0,
      };
    },

    /* One context and the versions a person may choose between. Withdrawn cards
       are not offered: nobody should be able to start wanting one that is no
       longer listed, while everyone already pointing at one keeps their row. */
    async readCardContext(cardContextId) {
      const rows = await read(
        `select ${contextColumns("c")}, e.name as expansion_name,
                e.code as expansion_code, e.series as expansion_series,
                e.release_date as expansion_release_date
         from metyet_catalog.card_contexts c
         join metyet_catalog.expansions e on e.expansion_id = c.expansion_id
         where c.card_context_id = $1`, [text(cardContextId)]);
      if (!rows.length) return null;
      const cards = await read(
        `select ${CARD_COLUMNS} from metyet_catalog.canonical_cards
         where card_context_id = $1 and status = 'active'
         order by print_run, finish, language, stamp, print_variation`, [text(cardContextId)]);
      const r = rows[0];
      return {
        context: { ...contextRow(r),
          expansionName: r.expansion_name, expansionCode: r.expansion_code,
          expansionSeries: r.expansion_series, expansionReleaseDate: r.expansion_release_date },
        canonicalCards: cards.map(cardRow),
      };
    },

    /* WHAT A SET OF CARDS LOOKS LIKE, IN ONE QUERY (Phase 5 Batch 6).

       An inventory screen holds a handful of copies, each naming a canonical
       card, and needs to say which card each one is: the name, the release, the
       number, the finish, the print run, the language, a picture. Asking for
       them one at a time is the N+1 that makes a shelf of thirty copies thirty
       round trips; asking for the catalog is shipping eighteen thousand cards
       to draw five rows. So it is one query for the ids the caller already
       holds, capped, and it joins the context and the expansion itself.

       IT IS DISPLAY, AND IT SAYS SO. Nothing here is identity: the id the
       caller passed in is the identity, and everything that comes back is what
       a person needs to recognise it. Withdrawn cards are described like any
       other, because a copy somebody already owns does not stop existing when
       a source stops listing its card. */
    async describeCanonicalCards(canonicalCardIds) {
      const ids = [...new Set(list(canonicalCardIds).map(text).filter(Boolean))].slice(0, MAX_PAGE_SIZE);
      if (!ids.length) return [];
      const rows = await read(`select k.canonical_card_id, k.print_run, k.finish, k.language,
          k.stamp, k.print_variation, k.image_small, k.image_large, k.status,
          c.card_context_id, c.collector_number, c.card_name, c.artist, c.rarity,
          e.name as expansion_name, e.code as expansion_code, e.series as expansion_series
        from metyet_catalog.canonical_cards k
        join metyet_catalog.card_contexts c on c.card_context_id = k.card_context_id
        join metyet_catalog.expansions e on e.expansion_id = c.expansion_id
        where k.canonical_card_id = any($1::text[])`, [ids]);
      return rows.map((r) => ({
        canonicalCardId: r.canonical_card_id,
        cardContextId: r.card_context_id,
        cardName: r.card_name,
        expansionName: r.expansion_name,
        expansionCode: r.expansion_code,
        expansionSeries: r.expansion_series,
        collectorNumber: r.collector_number,
        artist: r.artist,
        rarity: r.rarity,
        printRun: r.print_run,
        finish: r.finish,
        language: r.language,
        stamp: r.stamp,
        printVariation: r.print_variation,
        imageSmall: r.image_small,
        imageLarge: r.image_large,
        status: r.status,
      }));
    },

    /* THE QUESTION A WRITE ASKS: may somebody start owning this card today?

       Existence is not enough. A withdrawn card is one a source stopped
       listing, and while everybody already pointing at one keeps their row,
       nobody may newly choose it — otherwise a Trusted Partner adds a copy of
       something the catalog is in the middle of retracting. Returns the card,
       or null, and the caller turns null into one refusal. */
    async findSelectableCanonicalCard(canonicalCardId) {
      const rows = await read(`select ${CARD_COLUMNS} from metyet_catalog.canonical_cards
        where canonical_card_id = $1 and status = 'active'`, [text(canonicalCardId)]);
      return rows.length ? cardRow(rows[0]) : null;
    },

    async readCanonicalCard(canonicalCardId) {
      const rows = await read(`select ${CARD_COLUMNS} from metyet_catalog.canonical_cards
        where canonical_card_id = $1`, [text(canonicalCardId)]);
      return rows.length ? cardRow(rows[0]) : null;
    },

    /* WHICH OF THESE RELEASES THIS CATALOG ALREADY HOLDS (Phase 5 C6.1).
       Read-only, and the only reason it exists: an import can tell an operator
       which expansion codes a run would CREATE before it creates any of them.

       Keyed by MetYet's own natural key, because that is what `putExpansion`
       keys by — asking any other way would be asking a different question from
       the one the write will answer. It takes MetYet codes and returns MetYet
       codes; no provider id, set name or vocabulary reaches it.

       It is a lookup, not a policy. Nothing here decides whether a code SHOULD
       exist — the catalog has no opinion about that and neither should this. */
    async knownExpansionCodes(codes, { game = "pokemon" } = {}) {
      const wanted = [...new Set((Array.isArray(codes) ? codes : [])
        .map((c) => text(c)).filter(Boolean))];
      if (!wanted.length) return [];
      /* ASKED AND ANSWERED IN THE SAME CURRENCY — the natural key, which is
         case-folded (`domain/card-identity.js`). The first version looked rows
         up by key and then filtered the answer against the `code` COLUMN, which
         `putExpansion` never rewrites. So a catalog holding `base1`, asked about
         `Base1`, answered "no" — and the import then reused the existing row
         anyway, because the WRITE keys by the same folded key. The preflight
         said "a release not in the catalog yet, check this is what you meant"
         about a run that was in fact about to file Base Set 2's cards under
         Base Set and rename it. A safety line that reassures in exactly the
         dangerous case is worse than no line, which is why this is keyed
         throughout and returns the CALLER's spelling of what it found. */
      const byKey = new Map();
      for (const code of wanted) byKey.set(CI.expansionNaturalKey({ game, code }), code);
      const rows = await read(
        "select natural_key from metyet_catalog.expansions where natural_key = any($1)",
        [[...byKey.keys()]]);
      return rows.map((r) => byKey.get(r.natural_key)).filter(Boolean);
    },

    async readExpansion(expansionId) {
      const rows = await read(`select expansion_id, game, code, natural_key, name, series,
        release_date, printed_total from metyet_catalog.expansions where expansion_id = $1`,
        [text(expansionId)]);
      return rows.length ? expansionRow(rows[0]) : null;
    },

    /* What is waiting to be understood. A queue, not a log: a non-empty answer
       is a signal that a source says something MetYet does not yet model. */
    async readQuarantine({ provider, limit = MAX_PAGE_SIZE } = {}) {
      const size = Math.min(Math.max(Number(limit) || MAX_PAGE_SIZE, 1), MAX_PAGE_SIZE);
      const rows = await read(`select source_mapping_id, provider, provider_card_id,
          provider_variant_key, raw, quarantine_reason, first_seen_at, last_seen_at
        from metyet_catalog.source_mappings
        where status = 'quarantined' ${text(provider) ? "and provider = $1" : ""}
        order by first_seen_at limit ${size}`, text(provider) ? [text(provider)] : []);
      return rows.map((r) => ({
        sourceMappingId: r.source_mapping_id,
        provider: r.provider,
        providerCardId: r.provider_card_id,
        providerVariantKey: r.provider_variant_key,
        raw: r.raw,
        reason: r.quarantine_reason,
      }));
    },
  };
}

module.exports = { createCatalogRepository, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
