/* ============================================================================
   PHASE 5 BATCH 5 — CANONICAL CARD IDENTITY & SOURCE TRANSLATION

   What "the same card" means, owned by MetYet, proved against a real Postgres.

   The batch it covers answers three questions the product could not answer
   before: which card is this, where did MetYet learn about it, and how does
   anybody look at one without dragging the canonical world through a lock.

   A. identity            what makes two cards the same card, and what does not
   B. provider lineage    translation, quarantine, and ids that never leak
   C. the read boundary   browsing without the world
   D. compatibility       nothing that already worked works differently
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { createTranslator, applyTranslation, QUARANTINE } = require("../server/catalog/translation.js");
const { createApp } = require("../server/app.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { projectForActor } = require("../domain/metyet-projection.js");
const { validateWorld, REQUIRED_COLLECTIONS, OPTIONAL_COLLECTIONS } = require("../domain/metyet-world.js");
const CI = require("../domain/card-identity.js");
const D = require("../domain/metyet-domain.js");
const RT = require("../domain/metyet-runtime.js");
const C = require("../domain/metyet-commands.js");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

/* A migrated database with an empty world and an empty catalog — production's
   own starting state, which is what makes these assertions mean anything. */
async function blank() {
  const pg = database();
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  const runtime = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 1000 });
  return { pg, db, runtime,
    catalog: createCatalogRepository(db, { newId: runtime.newId }),
    repository: createWorldRepository(db) };
}

/* Base Set Charizard, the card this whole model was designed around: one
   checklist line, three collectible printings, and a first edition that is
   itself shadowless. */
const BASE_SET = { game: "pokemon", code: "base1", name: "Base", series: "Base",
  releaseDate: "1999-01-09", printedTotal: 102 };
const CHARIZARD = { game: "pokemon", collectorNumber: "4", cardName: "Charizard",
  artist: "Mitsuhiro Arita", rarity: "Rare Holo", supertype: "Pokémon" };

async function baseSetCharizard(ctx) {
  const { expansionId } = await ctx.catalog.putExpansion(BASE_SET);
  const { cardContextId } = await ctx.catalog.putCardContext({ ...CHARIZARD, expansionId });
  return { expansionId, cardContextId };
}

/* ============================================================== A */
describe("A. what makes two cards the same card", () => {

  test("a release, a number and a name — and the name is not optional", async () => {
    const ctx = await blank();
    const { expansionId } = await ctx.catalog.putExpansion(BASE_SET);

    /* Celebrations is why the name is in the key: that release reprints cards
       under their ORIGINAL numbering, so four different cards there are all
       numbered 15. Four contexts, one number, one expansion. */
    const celebrations = await ctx.catalog.putExpansion(
      { game: "pokemon", code: "cel25c", name: "Celebrations: Classic Collection", printedTotal: 25 });
    const names = ["Venusaur", "Here Comes Team Rocket!", "Rocket's Zapdos", "Claydol"];
    const ids = [];
    for (const cardName of names) {
      const { cardContextId } = await ctx.catalog.putCardContext({
        game: "pokemon", expansionId: celebrations.expansionId, collectorNumber: "15", cardName });
      ids.push(cardContextId);
    }
    eq(new Set(ids).size, 4, "four cards sharing a number are four contexts");

    /* And the same number and name in a DIFFERENT release is a different card
       again, however identical the artwork. */
    const here = await ctx.catalog.putCardContext({ ...CHARIZARD, expansionId });
    const base2 = await ctx.catalog.putExpansion({ game: "pokemon", code: "base4", name: "Base Set 2" });
    const there = await ctx.catalog.putCardContext({ ...CHARIZARD, expansionId: base2.expansionId });
    assert(here.cardContextId !== there.cardContextId,
      "the same illustration in another release is another card");
  });

  test("one context, several printings — and every dimension separates them", async () => {
    const ctx = await blank();
    const { cardContextId } = await baseSetCharizard(ctx);
    const made = [];
    for (const dimensions of [
      { printRun: "first_edition", finish: "holofoil" },
      { printRun: "shadowless", finish: "holofoil" },
      { printRun: "unlimited", finish: "holofoil" },
      /* the same print run in another finish */
      { printRun: "unlimited", finish: "reverse_holofoil" },
      /* and in another language */
      { printRun: "unlimited", finish: "holofoil", language: "ja" },
    ]) {
      const { canonicalCardId } = await ctx.catalog.putCanonicalCard({ cardContextId, ...dimensions });
      made.push(canonicalCardId);
    }
    eq(new Set(made).size, 5, "five printings, five canonical cards");

    const found = await ctx.catalog.readCardContext(cardContextId);
    eq(found.canonicalCards.length, 5, "and they all hang under the one context");
    eq(found.context.cardName, "Charizard", "which is still one card to look at");
  });

  test("the reserved dimensions are in the key, at their defaults, from today", async () => {
    const ctx = await blank();
    const { cardContextId } = await baseSetCharizard(ctx);
    const plain = await ctx.catalog.putCanonicalCard(
      { cardContextId, printRun: "unlimited", finish: "holofoil" });

    /* Nobody supplies these, so nothing populates them — but a card that HAS
       one must be able to exist without renumbering the card that does not. */
    const stamped = await ctx.catalog.putCanonicalCard(
      { cardContextId, printRun: "unlimited", finish: "holofoil", stamp: "prerelease" });
    const corrected = await ctx.catalog.putCanonicalCard(
      { cardContextId, printRun: "unlimited", finish: "holofoil", printVariation: "corrected" });
    eq(new Set([plain.canonicalCardId, stamped.canonicalCardId, corrected.canonicalCardId]).size, 3,
      "a stamp and a correction each make a different card");

    /* And the plain one is unchanged by their arrival — which is the whole
       reason the dimensions are in the key from the first day. */
    const again = await ctx.catalog.putCanonicalCard(
      { cardContextId, printRun: "unlimited", finish: "holofoil" });
    eq(again.canonicalCardId, plain.canonicalCardId, "the card that was already there kept its id");
    eq(again.created, false, "and was not minted a second time");
  });

  test("a collector number is a string, including when it is punctuation", async () => {
    const ctx = await blank();
    const { expansionId } = await ctx.catalog.putExpansion(
      { game: "pokemon", code: "ex10", name: "Unseen Forces", printedTotal: 115 });
    /* The Unown run is numbered by letter, and two of the letters are not
       letters. A catalog that parsed numbers would lose these. */
    const shapes = ["4", "TG01", "H12", "182a", "83", "!", "?", "A", "SWSH001"];
    const seen = [];
    for (const collectorNumber of shapes) {
      const { cardContextId } = await ctx.catalog.putCardContext(
        { game: "pokemon", expansionId, collectorNumber, cardName: "Unown" });
      const back = await ctx.catalog.readCardContext(cardContextId);
      eq(back.context.collectorNumber, collectorNumber, `"${collectorNumber}" survived the round trip`);
      seen.push(cardContextId);
    }
    eq(new Set(seen).size, shapes.length, "and each one is its own card");
  });

  test("an id is not a function of anything that can be corrected", async () => {
    const ctx = await blank();
    const { expansionId } = await ctx.catalog.putExpansion(BASE_SET);
    const first = await ctx.catalog.putCardContext({ ...CHARIZARD, expansionId, artist: "M. Arita" });
    /* The artist was recorded wrong and is fixed. A person hunting this card
       must still be hunting this card. */
    const fixed = await ctx.catalog.putCardContext(
      { ...CHARIZARD, expansionId, artist: "Mitsuhiro Arita", rarity: "Rare Holo V" });
    eq(fixed.cardContextId, first.cardContextId, "the id did not move because a label did");
    eq(fixed.created, false, "nothing was minted");
    const back = await ctx.catalog.readCardContext(first.cardContextId);
    eq(back.context.artist, "Mitsuhiro Arita", "and the correction landed");
  });

  test("grade and condition are nowhere in card identity", () => {
    const source = read("domain/card-identity.js");
    /* Not a spelling check: these words describe a physical copy somebody
       holds, and a key that contained one would make a Goal for a PSA 9 a
       different CARD rather than a different want. */
    for (const word of ["grade", "condition", "cert", "psa"]) {
      assert(!new RegExp(`\\b${word}\\b`, "i").test(source.replace(/\/\*[\s\S]*?\*\//g, "")),
        `card identity mentions "${word}" outside its prose`);
    }
    const key = CI.canonicalCardNaturalKey({ cardContextId: "cx1", printRun: "unlimited", finish: "holofoil" });
    eq(key, "cx1|unlimited|holofoil|en|none|standard", "five dimensions and a context, and nothing else");
  });

  test("artwork is never identity", () => {
    const source = read("domain/card-identity.js").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const word of ["image", "artwork", "illustration", "artist"]) {
      assert(!new RegExp(word, "i").test(source), `card identity reads "${word}"`);
    }
  });

  test("a vocabulary MetYet does not know is refused, not defaulted", () => {
    for (const bad of [
      { printRun: "fifth_print" }, { finish: "rainbow_foil" },
      { language: "english" }, { stamp: "pokemon_center" }, { printVariation: "misprint" },
    ]) {
      let threw = false;
      try { CI.assertVocabulary(CI.withDefaults(bad)); } catch (error) { threw = true; }
      assert(threw, `${JSON.stringify(bad)} was accepted`);
      eq(CI.knownVocabulary(bad), false, "and is reported unknown");
    }
    /* There is deliberately no `unknown` value to fall into. */
    assert(!CI.PRINT_RUNS.includes("unknown"), "print runs offer no `unknown`");
    assert(!CI.FINISHES.includes("unknown"), "finishes offer no `unknown`");
  });
});

/* ============================================================== B */
describe("B. where a card came from, and what that may never decide", () => {

  /* Two providers that model the same three printings completely differently:
     one names each printing, the other reports availability booleans and leaves
     the adapter to enumerate. Both must arrive at the same cards. */
  const NAMED = {
    expansions: { "base1": "base1" },
    variants: {
      firstEditionShadowlessHolofoil: { printRun: "first_edition", finish: "holofoil" },
      unlimitedShadowlessHolofoil: { printRun: "shadowless", finish: "holofoil" },
      unlimitedHolofoil: { printRun: "unlimited", finish: "holofoil" },
    },
  };
  const FLAGGED = {
    expansions: { "base-set": "base1" },
    variants: {
      "holo:firstEdition": { printRun: "first_edition", finish: "holofoil" },
      "holo:shadowless": { printRun: "shadowless", finish: "holofoil" },
      "holo": { printRun: "unlimited", finish: "holofoil" },
    },
  };

  const record = (over = {}) => ({
    providerExpansionId: "base1", providerCardId: "base1-4",
    providerVariantKey: "unlimitedHolofoil",
    expansionName: "Base", collectorNumber: "4", cardName: "Charizard",
    artist: "Mitsuhiro Arita", imageSmall: "https://example.invalid/4.png", ...over });

  test("a known vocabulary maps explicitly, and the whole string is the key", async () => {
    const ctx = await blank();
    const translator = createTranslator({ provider: "alpha", vocabulary: NAMED });
    const out = translator.translate(record({ providerVariantKey: "firstEditionShadowlessHolofoil" }));
    assert(out.ok, "translated");
    eq(out.record.canonicalCard.printRun, "first_edition", "1st Edition is a print run");
    eq(out.record.canonicalCard.finish, "holofoil", "and holofoil is a finish");

    /* The trap this exists to avoid: `unlimitedShadowlessHolofoil` contains the
       word unlimited and means Shadowless, while `firstEditionShadowlessHolofoil`
       contains the word shadowless and means 1st Edition. A substring would put
       both in the same print run. */
    const shadowless = translator.translate(record({ providerVariantKey: "unlimitedShadowlessHolofoil" }));
    eq(shadowless.record.canonicalCard.printRun, "shadowless",
      "the whole string decided, not a word inside it");
    await applyTranslation(ctx.catalog, out);
  });

  test("an unknown vocabulary is quarantined — it does not become the nearest known value", async () => {
    const ctx = await blank();
    const translator = createTranslator({ provider: "alpha", vocabulary: NAMED });
    const out = translator.translate(record({ providerVariantKey: "fourthPrintHolofoil" }));
    eq(out.ok, false, "refused");
    eq(out.quarantine.reason, QUARANTINE.unknownVariant, "and says why");

    const applied = await applyTranslation(ctx.catalog, out);
    eq(applied.quarantined, true, "filed rather than dropped");
    const waiting = await ctx.catalog.readQuarantine();
    eq(waiting.length, 1, "and it is in the queue");
    eq(waiting[0].providerVariantKey, "fourthPrintHolofoil", "with what it said");
    assert(/unknown-variant/.test(waiting[0].reason), "and why it is waiting");

    /* The thing that must NOT have happened: no card exists that somebody could
       now want, or claim to hold, on the strength of a guess. */
    const found = await ctx.catalog.findCardContexts({});
    eq(found.total, 0, "no context was invented");
    const rows = await ctx.pg.query("select count(*)::int as n from metyet_catalog.canonical_cards");
    eq(rows.rows[0].n, 0, "and no canonical card");
  });

  test("an unmapped release quarantines too, and a record MetYet cannot file is named as such", async () => {
    const ctx = await blank();
    const translator = createTranslator({ provider: "alpha", vocabulary: NAMED });
    const stranger = translator.translate(record({ providerExpansionId: "sv8", providerCardId: "sv8-1" }));
    eq(stranger.quarantine.reason, QUARANTINE.unknownExpansion, "an unmapped release waits");
    const nameless = translator.translate(record({ cardName: "", providerCardId: "base1-9" }));
    eq(nameless.quarantine.reason, QUARANTINE.incomplete, "and a record with no name is incomplete");
    await applyTranslation(ctx.catalog, stranger);
    await applyTranslation(ctx.catalog, nameless);
    eq((await ctx.catalog.readQuarantine()).length, 2, "both are waiting");
  });

  test("lossy mapping is refused — the adapter's own refusal is believed", async () => {
    const ctx = await blank();
    const translator = createTranslator({ provider: "alpha", vocabulary: NAMED });
    const out = translator.translate(record({ unmappable: "the source distinguishes a stamp we cannot carry" }));
    eq(out.ok, false, "refused");
    eq(out.quarantine.reason, QUARANTINE.lossy, "as lossy, not as unknown");
    await applyTranslation(ctx.catalog, out);
    const waiting = await ctx.catalog.readQuarantine();
    assert(/stamp we cannot carry/.test(waiting[0].reason), "and the adapter's reason survived");
  });

  test("the source's own words are kept, and never become MetYet's", async () => {
    const ctx = await blank();
    const translator = createTranslator({ provider: "alpha", vocabulary: NAMED });
    const applied = await applyTranslation(ctx.catalog, translator.translate(record()));
    assert(!applied.quarantined, "mapped");

    const mapping = (await ctx.pg.query(
      "select provider, provider_card_id, provider_variant_key, raw, status from metyet_catalog.source_mappings")).rows[0];
    eq(mapping.provider, "alpha", "the provider is recorded");
    eq(mapping.provider_card_id, "base1-4", "and its id");
    eq(mapping.raw.cardName, "Charizard", "and enough of what it said to audit the decision");

    /* And none of it is anywhere in MetYet's own identity. */
    for (const table of ["expansions", "card_contexts", "canonical_cards"]) {
      const rows = (await ctx.pg.query(`select * from metyet_catalog.${table}`)).rows;
      const text = JSON.stringify(rows);
      assert(!text.includes("base1-4"), `${table} carries the provider's card id`);
      assert(!text.includes("unlimitedHolofoil"), `${table} carries the provider's variant name`);
      assert(!text.includes("alpha"), `${table} names the provider`);
    }
    assert(/^cc/.test(applied.canonicalCardId), "the id is MetYet's own token");
  });

  test("two providers describing one card arrive at one canonical card", async () => {
    const ctx = await blank();
    const alpha = createTranslator({ provider: "alpha", vocabulary: NAMED });
    const beta = createTranslator({ provider: "beta", vocabulary: FLAGGED });

    const first = await applyTranslation(ctx.catalog, alpha.translate(record()));
    const second = await applyTranslation(ctx.catalog, beta.translate(record({
      providerExpansionId: "base-set", providerCardId: "pkm_000004",
      providerVariantKey: "holo" })));

    eq(second.canonicalCardId, first.canonicalCardId, "one card, however it was described");
    eq(second.cardContextId, first.cardContextId, "and one context");
    const mappings = (await ctx.pg.query(
      "select provider from metyet_catalog.source_mappings order by provider")).rows.map((r) => r.provider);
    eq(mappings.join(), "alpha,beta", "with both sources recorded against it");
  });

  test("a source that stops listing a card does not delete it", async () => {
    const ctx = await blank();
    const translator = createTranslator({ provider: "alpha", vocabulary: NAMED });
    const applied = await applyTranslation(ctx.catalog, translator.translate(record()));

    eq(await ctx.catalog.withdrawCanonicalCard(applied.canonicalCardId), true, "withdrawn");
    const still = await ctx.catalog.readCanonicalCard(applied.canonicalCardId);
    assert(still, "the card is still there");
    eq(still.status, "withdrawn", "and says so");
    eq(still.canonicalCardId, applied.canonicalCardId, "with the id anything pointing at it still uses");

    /* Withdrawn is not offered to somebody choosing a version — but seeing it
       again revives it rather than minting a second identity. */
    const context = await ctx.catalog.readCardContext(applied.cardContextId);
    eq(context.canonicalCards.length, 0, "not offered while withdrawn");
    const again = await applyTranslation(ctx.catalog, translator.translate(record()));
    eq(again.canonicalCardId, applied.canonicalCardId, "and it came back as itself");
  });

  test("a variant a provider renames stops being mapped, and the card survives", async () => {
    const ctx = await blank();
    const translator = createTranslator({ provider: "alpha", vocabulary: NAMED });
    const applied = await applyTranslation(ctx.catalog, translator.translate(record()));
    assert(!applied.quarantined, "mapped first");

    /* The provider renames `unlimitedHolofoil` to something MetYet has never
       seen. The RECORD stops being understood — but the card it already made
       is still a card somebody may be hunting, so it is not touched. */
    const renamed = translator.translate(record({ providerVariantKey: "unlimitedHolofoilV2" }));
    eq(renamed.quarantine.reason, QUARANTINE.unknownVariant, "the new word is unknown");
    await applyTranslation(ctx.catalog, renamed);

    const card = await ctx.catalog.readCanonicalCard(applied.canonicalCardId);
    assert(card, "the canonical card is still there");
    eq(card.status, "active", "and untouched by a provider's vocabulary change");
    eq((await ctx.catalog.readQuarantine()).length, 1, "with the record that stopped making sense waiting");

    /* And the same mapping row going the other way — a quarantined record that
       becomes understood — resolves in place rather than leaving a stale row. */
    const widened = createTranslator({ provider: "alpha",
      vocabulary: { ...NAMED, variants: { ...NAMED.variants,
        unlimitedHolofoilV2: { printRun: "unlimited", finish: "holofoil" } } } });
    const resolved = await applyTranslation(ctx.catalog, widened.translate(
      record({ providerVariantKey: "unlimitedHolofoilV2" })));
    eq(resolved.canonicalCardId, applied.canonicalCardId, "and it resolves to the card it always was");
    eq((await ctx.catalog.readQuarantine()).length, 0, "the queue emptied");
  });

  test("importing the same records twice changes nothing", async () => {
    const ctx = await blank();
    const translator = createTranslator({ provider: "alpha", vocabulary: NAMED });
    const rows = ["firstEditionShadowlessHolofoil", "unlimitedShadowlessHolofoil", "unlimitedHolofoil"];
    const once = [];
    for (const providerVariantKey of rows) {
      once.push((await applyTranslation(ctx.catalog, translator.translate(record({ providerVariantKey })))).canonicalCardId);
    }
    const twice = [];
    for (const providerVariantKey of rows) {
      twice.push((await applyTranslation(ctx.catalog, translator.translate(record({ providerVariantKey })))).canonicalCardId);
    }
    eq(twice.join(), once.join(), "the same ids came back");
    const counts = (await ctx.pg.query(`select
        (select count(*) from metyet_catalog.expansions)::int as x,
        (select count(*) from metyet_catalog.card_contexts)::int as c,
        (select count(*) from metyet_catalog.canonical_cards)::int as k`)).rows[0];
    eq(`${counts.x},${counts.c},${counts.k}`, "1,1,3", "one release, one context, three printings");
  });

  test("a mapping table with a word MetYet does not know is refused when it is built", () => {
    let threw = false;
    try {
      createTranslator({ provider: "alpha",
        vocabulary: { expansions: {}, variants: { x: { printRun: "fifth_print", finish: "holofoil" } } } });
    } catch (error) { threw = true; }
    assert(threw, "a typo in a vocabulary is a startup error, not a wrong card later");
  });

  test("no provider is integrated, and nothing here reaches a network", () => {
    const files = ["server/catalog/translation.js", "persistence/catalog-repository.js",
      "domain/card-identity.js", "persistence/migrations/0006_card_catalog.sql"];
    for (const file of files) {
      const text = read(file);
      assert(!/scrydex|tcgdex|pokemontcg|api\.[a-z]/i.test(text), file + " names a provider");
      assert(!/\bfetch\(|require\(["']https?["']\)|axios|node-fetch/.test(text), file + " reaches a network");
    }
  });
});

/* ============================================================== C */
describe("C. browsing the catalog without the world", () => {

  const SUBJECT = "sub-casey";
  async function served() {
    const ctx = await blank();
    /* The world a production deployment actually has: every collection, and
       an empty catalog it will never fill again. */
    const world = { catalog: [], collectors: [{ id: "c1", name: "Casey" }], partners: [], relationships: [],
      invitations: [], goals: [], inventory: [], collectorCopies: [], interests: [], opportunities: [],
      conversations: [], photoRequests: [], copyReviews: [] };
    await ctx.repository.saveWorld(world);
    const accounts = createAccountDirectory(ctx.db);
    await accounts.linkAccount({ subject: SUBJECT, role: "collector", collectorId: "c1" });
    const verifier = { verify: async (token) => (token === "casey"
      ? { subject: SUBJECT, email: "casey@example.invalid", emailVerified: true }
      : (() => { throw Object.assign(new Error("no"), { reason: "bad token" }); })()) };
    const app = createApp({ repository: ctx.repository, catalog: ctx.catalog, accounts, verifier,
      runtime: ctx.runtime });
    return { ...ctx, app, world };
  }
  const get = (app, url, token = "casey") =>
    app.inject({ method: "GET", url, headers: { authorization: `Bearer ${token}` } });

  async function stock(ctx, howMany) {
    const { expansionId } = await ctx.catalog.putExpansion(BASE_SET);
    for (let i = 1; i <= howMany; i += 1) {
      const { cardContextId } = await ctx.catalog.putCardContext({ game: "pokemon", expansionId,
        collectorNumber: String(i), cardName: `Card ${String(i).padStart(3, "0")}`,
        artist: i % 2 ? "Mitsuhiro Arita" : "Ken Sugimori" });
      await ctx.catalog.putCanonicalCard({ cardContextId, printRun: "unlimited", finish: "non_holo" });
    }
    return expansionId;
  }

  test("a catalog read loads no world and takes no lock", async () => {
    const ctx = await served();
    await stock(ctx, 3);
    /* The world repository is wrapped so that any load or lock during a card
       read is a failure rather than a slow path nobody noticed. */
    let touched = 0;
    const watched = { ...ctx.repository,
      loadWorld: async (...a) => { touched += 1; return ctx.repository.loadWorld(...a); },
      lockWorld: async (...a) => { touched += 1; return ctx.repository.lockWorld(...a); } };
    const accounts = createAccountDirectory(ctx.db);
    const verifier = { verify: async () => ({ subject: SUBJECT, email: "c@x.invalid", emailVerified: true }) };
    const app = createApp({ repository: watched, catalog: ctx.catalog, accounts, verifier, runtime: ctx.runtime });
    const res = await get(app, "/api/card-contexts");
    eq(res.statusCode, 200, res.body);
    eq(touched, 0, "the canonical world was never opened to look at a card");
  });

  test("the browse unit is a context, and the reply is MetYet's own vocabulary", async () => {
    const ctx = await served();
    const expansionId = await stock(ctx, 2);
    const body = (await get(ctx.app, "/api/card-contexts")).json();
    eq(body.contexts.length, 2, "two contexts");
    for (const c of body.contexts) {
      assert(/^cx/.test(c.cardContextId), "a MetYet id");
      eq(typeof c.collectorNumber, "string", "a number that is a string");
      assert(!("providerCardId" in c) && !("naturalKey" in c),
        "no provider identity and no natural key in the contract");
    }
    const one = (await get(ctx.app, `/api/card-contexts/${body.contexts[0].cardContextId}`)).json();
    eq(one.canonicalCards.length, 1, "the detail carries the versions to choose between");
    assert(/^cc/.test(one.canonicalCards[0].canonicalCardId), "each one addressable by a MetYet id");
    eq(one.context.expansionId, expansionId, "and the release it belongs to");
  });

  test("pagination, and the three doorways search will need", async () => {
    const ctx = await served();
    await stock(ctx, 30);
    const first = (await get(ctx.app, "/api/card-contexts?pageSize=10&page=1")).json();
    eq(first.contexts.length, 10, "a page");
    eq(first.total, 30, "of a known total");
    const second = (await get(ctx.app, "/api/card-contexts?pageSize=10&page=2")).json();
    const overlap = second.contexts.filter((c) =>
      first.contexts.some((f) => f.cardContextId === c.cardContextId));
    eq(overlap.length, 0, "and the next page is different cards");

    const byName = (await get(ctx.app, "/api/card-contexts?query=Card%20001")).json();
    eq(byName.total, 1, "by name");
    const byArtist = (await get(ctx.app, "/api/card-contexts?artist=Ken%20Sugimori")).json();
    eq(byArtist.total, 15, "by artist");
    const byExpansion = (await get(ctx.app, `/api/card-contexts?expansionId=${byName.contexts[0].expansionId}`)).json();
    eq(byExpansion.total, 30, "by release");
  });

  test("the card routes are authenticated, and a card nobody has is a plain 404", async () => {
    const ctx = await served();
    await stock(ctx, 1);
    const anonymous = await ctx.app.inject({ method: "GET", url: "/api/card-contexts" });
    eq(anonymous.statusCode, 401, "no bearer, no catalog");
    const missing = await get(ctx.app, "/api/card-contexts/cxnope");
    eq(missing.statusCode, 404, "and an unknown card is not found");
  });

  test("the catalog is not in the world, and is not shipped in a projection", async () => {
    const ctx = await served();
    await stock(ctx, 5);
    const world = await ctx.repository.loadWorld();
    eq((world.catalog || []).length, 0, "five cards exist and none of them is in the world");
    assert(validateWorld(world).ok, "and a world with no catalog is valid");
    assert(!REQUIRED_COLLECTIONS.includes("catalog"), "the world does not require one");
    assert(OPTIONAL_COLLECTIONS.includes("catalog"), "it merely tolerates one");

    const view = projectForActor(world, { seat: "collector", collectorId: "c1" });
    eq(view.catalog.length, 0, "and the projection carries no cards");

    /* The property, not the sample: the projection must not grow with the
       catalog. Five more cards, same projection. */
    const before = JSON.stringify(view);
    await stock(ctx, 5);
    const after = JSON.stringify(projectForActor(await ctx.repository.loadWorld(),
      { seat: "collector", collectorId: "c1" }));
    eq(after, before, "the view of the world does not change when the catalog does");
  });
});

/* ============================================================== D */
describe("D. nothing that already worked works differently", () => {

  test("the exact-match rule the product already uses is untouched", () => {
    /* Whatever B5 built, a Goal and an Inventory copy still match exactly as
       they did — same eight dimensions, same string, same answer. */
    const card = { name: "Charizard", set: "Base Set", num: "4/102", print: "Holo",
      edition: "Unlimited", language: "English", grade: "PSA 9", condition: null };
    eq(D.identityKey(card), "charizard|base set|4/102|holo|unlimited|english|psa 9|",
      "the established key, unchanged");
    const other = { ...card, grade: "PSA 8" };
    assert(!D.sameIdentity(card, other), "and a different grade is still a different identity");
    assert(D.sameIdentity(card, { ...card }), "and the same card still matches itself");
  });

  test("the new model is not wired into matching, so nothing was broadened", () => {
    const entities = read("domain/metyet-entities.js");
    assert(!/card-identity|canonicalCard/.test(entities),
      "matching still asks the domain it always asked");
    /* RESTATED IN BATCH 6, WHICH IS WHEN A COMMAND FIRST NAMED A CANONICAL
       CARD. `addInventoryCopy` now takes a `canonicalCardId` — that is the
       batch. What must stay true is narrower and more important: a command
       REFERENCES a card, it never reaches the catalog to make one. So no
       command may import the catalog's repository or its identity rules. */
    const commands = read("domain/metyet-commands.js");
    assert(!/card-identity|catalog-repository|metyet_catalog/.test(commands),
      "a command reached the catalog rather than merely naming a card");
  });

  test("a browser cannot mint a canonical card", () => {
    /* Not one command in the table touches the catalog schema, so there is no
       body a client could post that creates one. The only writer is an import,
       which is server-side and does not exist yet. */
    /* The word to look for is a WRITE, not a mention. Batch 6 has a command
       that names a canonical card id, which is the point of it; what no
       command may do is create an expansion, a context or a card. */
    for (const name of Object.keys(C.COMMANDS || {})) {
      const fn = String((C.COMMANDS || {})[name]);
      assert(!/metyet_catalog|putCanonicalCard|putCardContext|putExpansion/.test(fn),
        `command "${name}" writes canonical card identity`);
    }
    const app = read("server/app.js");
    const routes = app.match(/app\.(get|post|put|delete)\(\s*"([^"]+)"/g) || [];
    const cardRoutes = routes.filter((r) => /card-contexts/.test(r));
    eq(cardRoutes.length, 2, "two card routes");
    assert(cardRoutes.every((r) => /app\.get/.test(r)), "and both of them are reads");
  });

  test("the catalog repository holds no product rule, and the domain holds no database", () => {
    const repo = read("persistence/catalog-repository.js");
    assert(!/goal|inventory|binder|opportunity|tier|primary|secondary/i.test(
      repo.replace(/\/\*[\s\S]*?\*\//g, "")), "the catalog knows nothing about what cards are for");
    const identity = read("domain/card-identity.js");
    assert(!/require\(["']\.\.\/persistence|@electric-sql|require\(["']pg["']\)/.test(identity),
      "and card identity knows nothing about a database");
  });

  test("the selection contract carries no Goal, Inventory or Binder state", async () => {
    const ctx = await blank();
    const { cardContextId } = await baseSetCharizard(ctx);
    await ctx.catalog.putCanonicalCard({ cardContextId, printRun: "unlimited", finish: "holofoil" });
    const detail = await ctx.catalog.readCardContext(cardContextId);
    const text = JSON.stringify(detail).toLowerCase();
    for (const word of ["goal", "tier", "primary", "secondary", "inventory", "binder", "ask", "cost", "grade"]) {
      assert(!text.includes(word), `the selection contract mentions "${word}"`);
    }
    eq(Object.keys(detail).sort().join(), "canonicalCards,context",
      "a context and the versions of it, and nothing else");
  });

  test("no dependency was added for any of this", () => {
    const pkg = JSON.parse(read("package.json"));
    eq(Object.keys(pkg.dependencies).sort().join(),
      "esbuild,fastify,jose,pg,react,react-dom,react-test-renderer",
      "the runtime dependencies are the server's, and nothing more");
  });
});

run();
