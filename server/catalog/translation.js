/* ============================================================================
   THE PROVIDER TRANSLATION BOUNDARY (Phase 5 Batch 5)

     createTranslator({ provider, vocabulary })  ->  { translate, provider }
     translate(sourceRecord)  ->  { ok: true,  record, ignored? }
                               |  { ok: false, quarantine: { reason, detail } }
                               |  { ok: false, rejected:   { reason, detail } }

   THREE OUTCOMES, NOT TWO (Phase 5 C4). A record either becomes a card, or
   WAITS — quarantined in `source_mappings`, keyed, counted, re-examined next
   run — or is REJECTED, which means it cannot be keyed and so cannot wait.
   The third exists because a quarantine that cannot be stored is not a
   quarantine, and because the alternative is fabricating a provider id. See
   `REJECTED` below.

   `translate` does not throw on a bad record. It throws only when it is
   MISUSED — no provider, no vocabulary — because those are programmer errors
   and a record is not.

   ONE SIDE OF THIS FILE SPEAKS A PROVIDER'S LANGUAGE. THE OTHER SPEAKS MetYet'S.
   Nothing crosses without being named.

   No provider is implemented here, and no network call is made from this file
   or from anything it requires. This is the port; an adapter is the thing that
   fetches a provider's records and hands them in. That separation is the whole
   reason a provider decision can still change without touching card identity.

   WHY PROVIDERS NEED TRANSLATING AT ALL. They do not merely spell things
   differently, they MODEL things differently. One enumerates a card's
   collectible printings by name — `firstEditionShadowlessHolofoil` is a single
   string carrying a print run, a shadowless distinction and a finish. Another
   reports booleans on the card itself — `holo: true, reverse: true,
   firstEdition: true` — which says which printings exist without giving any of
   them an identity. A third may split the same information across three
   columns. MetYet's model has to be the same card either way, so the mapping is
   data, declared per provider, and never inferred.

   THE INVARIANT THIS FILE EXISTS FOR:

     Unknown provider vocabulary is QUARANTINED, never collapsed into a known
     canonical value.

   If a source emits a variant this vocabulary does not name, the honest answer
   is that MetYet does not yet know what that card is. The tempting answer — the
   nearest known value, `unlimited`, `holofoil`, `standard` — creates a card that
   a Collector can want and a Trusted Partner can claim to hold, and that is
   wrong in a way nobody will notice until somebody drives to a shop. A
   quarantined record keeps its raw payload, mints no canonical card, and is
   visible in a queue. An unanswered question beats a confident wrong answer.

   NO SUBSTRING HEURISTICS. `"firstEditionShadowlessHolofoil".includes("holofoil")`
   is true, and so is `"reverseHolofoil".includes("holofoil")`, and so is
   `"unlimitedShadowlessHolofoil".includes("shadowless")` — which describes the
   Shadowless print run, while `firstEditionShadowlessHolofoil` describes the
   1st Edition one, because 1st Edition cards ARE shadowless. A mapping that
   guessed from substrings would put both in the same print run and lose the
   distinction that makes one of them worth many times the other. So the table
   is exact, whole-string, and declared.

   LOSSY MAPPING IS REFUSED, which is a different failure from an unknown one. A
   record whose source says something MetYet's vocabulary CANNOT hold without
   discarding a distinction is quarantined too, rather than written with the
   distinction dropped.
   ========================================================================== */

const CI = require("../../domain/card-identity.js");

const text = (value) => (typeof value === "string" ? value.trim() : "");
const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/* The reasons a record does not become a card. Each is a word a queue can be
   grouped by, so "nineteen records mention a variant we do not know" is one
   line in a report rather than nineteen. */
const QUARANTINE = Object.freeze({
  unknownVariant: "unknown-variant",
  unknownExpansion: "unknown-expansion",
  incomplete: "incomplete-record",
  lossy: "lossy-mapping",
});

/* ------------------------------------------- AND THE ONES THAT CANNOT QUEUE
   (Phase 5 C4)

   A QUARANTINED record waits in `source_mappings` — it keeps its raw payload,
   it is counted, and the next import re-examines it. That only works because
   the row can be KEYED: the table's uniqueness is
   `(provider, provider_card_id, provider_variant_key)`, and a row with no
   provider card id has no identity to be remembered by.

   So there is a second, smaller category. A record MetYet cannot key is
   REJECTED for the run: named in the summary, counted by reason, and written
   nowhere. The alternative would be to invent a provider id so the row could
   be stored — which is the one thing the whole catalog design exists to
   prevent. A fabricated `provider_card_id` is a durable lie about somebody
   else's data, and it would collide with the next fabricated one.

   Rejection is not a softer quarantine. It is the honest answer to "we cannot
   even remember that we saw this", and the operator's fix is upstream in the
   adapter, not in a vocabulary. */
const REJECTED = Object.freeze({
  unreadable: "unreadable-record",
  unkeyable: "unkeyable-record",
});

/* `printed_total` is an int4 (persistence/migrations/0006_card_catalog.sql).
   A value outside that is not storable, whatever else is true of it. */
const INT4_MIN = -2147483648;
const INT4_MAX = 2147483647;
const int4OrNull = (value) => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= INT4_MIN && n <= INT4_MAX ? n : null;
};

/* ------------------------------------------------------------- VOCABULARY

   A provider vocabulary is a plain declaration:

     {
       expansions: { "<provider set id>": "<MetYet expansion code>" },
       variants:   { "<provider variant key>": { printRun, finish, language?,
                                                 stamp?, printVariation? } },
     }

   Every key is matched whole. A variant entry states every dimension it knows
   and stays silent about the rest, which the canonical defaults then fill —
   silence means "this card is unstamped and standard", which is a claim the
   adapter author is making deliberately by not contradicting it.

   A vocabulary is checked once, when the translator is built, so a typo in a
   mapping table is a startup error rather than a wrong card discovered later. */
function checkVocabulary(vocabulary) {
  if (!isObject(vocabulary)) throw new TypeError("translation: a vocabulary is required");
  const variants = isObject(vocabulary.variants) ? vocabulary.variants : null;
  if (!variants || !Object.keys(variants).length) {
    throw new TypeError("translation: a vocabulary needs at least one variant mapping");
  }
  for (const [key, mapped] of Object.entries(variants)) {
    if (!isObject(mapped)) throw new TypeError(`translation: variant "${key}" maps to nothing`);
    /* Judged by the domain, not here: there is one vocabulary in MetYet and one
       place that knows it. */
    CI.assertVocabulary(CI.withDefaults(mapped));
  }
  if (vocabulary.expansions !== undefined && !isObject(vocabulary.expansions)) {
    throw new TypeError("translation: expansions must be a mapping when present");
  }
  return true;
}

/* What an adapter hands in. Deliberately small: a translator has no opinion
   about how a record was fetched, paginated or authenticated.

     {
       providerExpansionId, providerCardId, providerVariantKey,
       collectorNumber, cardName,
       discriminator?,      -- the reserved collision-breaker; see 0006
       expansionName?, expansionSeries?, expansionReleaseDate?, expansionPrintedTotal?,
       artist?, rarity?, supertype?, subtypes?, pokedexNumbers?,
       imageSmall?, imageLarge?,
       language?,
       unmappable?          -- the adapter's own "I could not carry this"
     }

   `discriminator` was consumed by `translate` from the first day and missing
   from this list, which is worse than it sounds: it is the fifth segment of a
   card context's natural key, so an adapter written from this comment alone
   could not break the collision the schema reserves it for (Phase 5 C4).

   `expansionPrintedTotal`, when it is anything, must be an integer the
   `printed_total` column can hold. See `int4OrNull` above for what happens
   when it is not, and why that is not a quarantine. */
function createTranslator({ provider, vocabulary } = {}) {
  const name = text(provider);
  if (!name) throw new TypeError("translation: a provider name is required");
  checkVocabulary(vocabulary);
  const variants = vocabulary.variants;
  const expansions = isObject(vocabulary.expansions) ? vocabulary.expansions : {};

  /* Lineage, bounded. What the adapter actually read and what it could not map
     — enough to audit a translation decision later, and not a second copy of a
     provider's catalog inside MetYet's database. Credentials and keys are never
     part of a source record and so never reach here. */
  const lineageOf = (source) => ({
    providerExpansionId: text(source.providerExpansionId) || null,
    providerCardId: text(source.providerCardId),
    providerVariantKey: text(source.providerVariantKey),
    collectorNumber: text(source.collectorNumber),
    cardName: text(source.cardName),
    ...(source.unmappable === undefined ? {} : { unmappable: source.unmappable }),
  });

  const refuse = (source, reason, detail) => ({
    ok: false,
    quarantine: {
      provider: name,
      providerExpansionId: text(source.providerExpansionId) || null,
      providerCardId: text(source.providerCardId),
      providerVariantKey: text(source.providerVariantKey),
      reason,
      detail,
      raw: lineageOf(source),
    },
  });

  /* Not storable anywhere, so it carries no payload and names no provider
     record — there is nothing to name it BY. It exists to be counted. */
  const reject = (reason, detail) => ({ ok: false, rejected: { provider: name, reason, detail } });

  return {
    provider: name,

    translate(source) {
      /* A RECORD THAT IS NOT A RECORD (Phase 5 C4). `null`, a bare string, a
         number — an ordinary artefact of a trailing comma or a failed row in
         somebody's export. This used to throw, which meant one such element
         took down whatever transaction was open around it. It is classified
         now, because a malformed element of a well-formed file is a
         data-quality problem like any other and the pipeline's job is to name
         those, not to die of them. */
      if (!isObject(source)) {
        return reject(REJECTED.unreadable,
          `a source record must be an object, and this one is ${source === null ? "null" : typeof source}`);
      }

      /* A record MetYet cannot even file: no card id, no number, no name. There
         is nothing here to be uncertain ABOUT. */
      if (!text(source.collectorNumber) || !text(source.cardName)) {
        return refuse(source, QUARANTINE.incomplete,
          "a source record needs a provider card id, a collector number and a card name");
      }

      /* AND THE HALF OF THAT WHICH CANNOT WAIT IN THE QUEUE (Phase 5 C4). The
         three fields above are all required, but they are not equal: the
         provider's card id is what the mapping table is KEYED by, so a record
         without one cannot be remembered at all. `recordSourceMapping` refuses
         it — correctly — and before C4 that refusal arrived as a thrown
         TypeError from inside a quarantine write, which is the one place a
         quarantine must never fail. It is a run-level rejection now. */
      if (!text(source.providerCardId)) {
        return reject(REJECTED.unkeyable,
          "a source record has no provider card id, so no mapping can be keyed to it");
      }

      /* THE ADAPTER'S OWN REFUSAL, honoured first. An adapter that knows it is
         dropping something says so, and is believed — it read the payload and
         this file did not. This is what "refuses lossy mapping" means in
         practice: the component closest to the source decides it cannot carry a
         distinction, and nothing downstream overrules it. */
      if (source.unmappable) {
        return refuse(source, QUARANTINE.lossy,
          typeof source.unmappable === "string" ? source.unmappable
            : "the adapter reported a distinction it cannot carry");
      }

      const providerExpansionId = text(source.providerExpansionId);
      const expansionCode = text(expansions[providerExpansionId]);
      if (!expansionCode) {
        return refuse(source, QUARANTINE.unknownExpansion,
          `no MetYet expansion is mapped for "${providerExpansionId}"`);
      }

      /* THE WHOLE STRING, OR NOTHING. */
      const variantKey = text(source.providerVariantKey);
      const mapped = Object.prototype.hasOwnProperty.call(variants, variantKey)
        ? variants[variantKey] : null;
      if (!mapped) {
        return refuse(source, QUARANTINE.unknownVariant,
          `no canonical printing is mapped for variant "${variantKey}"`);
      }

      /* A source may state a language per record; the mapping may state one for
         a whole variant; otherwise the canonical default. Whatever it is, the
         domain judges it — a translator cannot invent a dimension value. */
      const dimensions = CI.withDefaults({
        ...mapped,
        ...(text(source.language) ? { language: text(source.language) } : {}),
      });
      try { CI.assertVocabulary(dimensions); }
      catch (error) {
        return refuse(source, QUARANTINE.lossy, error.message);
      }

      /* Said out loud so the runner can count it rather than the operator
         discovering a null months later. */
      const printedTotalIgnored = source.expansionPrintedTotal != null
        && source.expansionPrintedTotal !== ""
        && int4OrNull(source.expansionPrintedTotal) === null;

      return {
        ok: true,
        ...(printedTotalIgnored ? { ignored: ["expansion-printed-total"] } : {}),
        record: {
          provider: name,
          /* The MAPPING decides which MetYet release this is; the RECORD
             describes it. So renaming a set upstream is a description that
             changes, never an identity that moves. */
          expansion: {
            game: "pokemon",
            code: expansionCode,
            name: text(source.expansionName) || expansionCode,
            series: text(source.expansionSeries) || null,
            releaseDate: text(source.expansionReleaseDate) || null,
            /* A CHECKLIST TOTAL IS DESCRIPTIVE, AND A BAD ONE IS NOT A BAD
               CARD (Phase 5 C4). `printed_total` is nullable and explicitly
               descriptive — nothing validates a collector number against it,
               because secret rares legitimately exceed it. So a total that the
               column cannot hold ("102 cards", 10.5, a number past int4) is
               recorded as "nobody told us", which is true, rather than as a
               reason to reject the card, which would not be.

               THE REASON IT IS NOT A QUARANTINE. This field arrives on an
               EXPANSION and every card in that release carries it. One
               mistyped set total would otherwise quarantine the entire set —
               hundreds of perfectly identifiable cards, none of them wrong.
               It used to reach `printed_total integer` as `NaN` and abort the
               insert, which took the batch with it.

               It is not silent: the runner counts these and names them. */
            printedTotal: int4OrNull(source.expansionPrintedTotal),
          },
          context: {
            game: "pokemon",
            collectorNumber: text(source.collectorNumber),
            cardName: text(source.cardName),
            discriminator: text(source.discriminator),
            artist: text(source.artist) || null,
            rarity: text(source.rarity) || null,
            supertype: text(source.supertype) || null,
            subtypes: Array.isArray(source.subtypes) ? source.subtypes : [],
            pokedexNumbers: Array.isArray(source.pokedexNumbers) ? source.pokedexNumbers : [],
          },
          canonicalCard: {
            ...dimensions,
            imageSmall: text(source.imageSmall) || null,
            imageLarge: text(source.imageLarge) || null,
          },
          lineage: {
            provider: name,
            providerExpansionId: providerExpansionId || null,
            providerCardId: text(source.providerCardId),
            providerVariantKey: variantKey,
            raw: lineageOf(source),
          },
        },
      };
    },
  };
}

/* ------------------------------------------------- IMPORTING ONE RECORD

   The other half of the port: what a caller does with a translation. Kept here
   rather than in the repository because the decision — write a card, or file a
   quarantine — is a translation decision, and the repository should not have an
   opinion about provider records at all.

   A quarantined record still gets a source mapping row. That is what makes the
   queue a queue: the record is remembered, counted and re-examined next import,
   rather than dropped on the floor with a log line. */
async function applyTranslation(catalog, translation, { tx } = {}) {
  /* REJECTED WRITES NOTHING, and says so (Phase 5 C4). There is no row to
     write: the record could not be keyed, so storing it would mean inventing
     the key. A caller that receives this counts it and moves on. */
  if (!translation.ok && translation.rejected) {
    return { rejected: true, quarantined: false, reason: translation.rejected.reason };
  }

  if (!translation.ok) {
    const q = translation.quarantine;
    await catalog.recordSourceMapping({
      provider: q.provider,
      providerExpansionId: q.providerExpansionId,
      providerCardId: q.providerCardId,
      providerVariantKey: q.providerVariantKey,
      raw: q.raw,
      status: "quarantined",
      quarantineReason: `${q.reason}: ${q.detail}`,
    }, { tx });
    return { quarantined: true, rejected: false, reason: q.reason };
  }

  const r = translation.record;
  const expansion = await catalog.putExpansion(r.expansion, { tx });
  const context = await catalog.putCardContext(
    { ...r.context, expansionId: expansion.expansionId }, { tx });
  const card = await catalog.putCanonicalCard(
    { ...r.canonicalCard, cardContextId: context.cardContextId }, { tx });
  await catalog.recordSourceMapping({
    provider: r.lineage.provider,
    providerExpansionId: r.lineage.providerExpansionId,
    providerCardId: r.lineage.providerCardId,
    providerVariantKey: r.lineage.providerVariantKey,
    expansionId: expansion.expansionId,
    cardContextId: context.cardContextId,
    canonicalCardId: card.canonicalCardId,
    raw: r.lineage.raw,
    status: "mapped",
  }, { tx });
  /* WHETHER EACH LEVEL WAS MINTED OR FOUND (Phase 5 C4). The repository
     already answers this — every upsert returns `created` — and this used to
     discard it, which left a caller unable to say "twelve new releases, three
     already here" without counting rows itself. Passing it through is how a
     run summary earns the word "new". */
  return { quarantined: false, rejected: false,
    expansionId: expansion.expansionId,
    cardContextId: context.cardContextId,
    canonicalCardId: card.canonicalCardId,
    created: { expansion: expansion.created === true,
      context: context.created === true,
      card: card.created === true } };
}

module.exports = { createTranslator, applyTranslation, checkVocabulary, QUARANTINE, REJECTED };
