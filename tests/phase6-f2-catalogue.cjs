/* ============================================================================
   PHASE 6 P6-F2 — THE CATALOGUE BROWSE NEEDS (founder-approved D1–D3)
     A. the Pokédex       GET /api/pokemon — derived from the catalogue, exactly
                          as the frozen prototype derives it; bounded; paged
     B. the printed number  `number=` on /api/card-contexts — exact, composable
     C. the order         numeric-aware inside a set; stable pages; sets unchanged
     D. the door          authenticated, read-only, no command, no migration
     E. scale             a 20,000-card catalogue: bounded replies, measured time
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { createApp } = require("../server/app.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
const RT = require("../domain/metyet-runtime.js");

const ROOT = path.join(__dirname, "..");
const json = (v) => JSON.stringify(v);
let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

/* A small catalogue that exercises every rule. */
async function world() {
  const pg = database();
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  const runtime = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 1000 });
  const repository = createWorldRepository(db);
  const catalog = createCatalogRepository(db, { newId: runtime.newId });
  await repository.saveWorld({ catalog: [], collectors: [{ id: "c1", name: "Casey" }], partners: [], relationships: [],
    invitations: [], goals: [], inventory: [], collectorCopies: [], binders: [], binderEntries: [], interests: [],
    opportunities: [], conversations: [], photoRequests: [], copyReviews: [] });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: "sub-casey", role: "collector", collectorId: "c1" });
  const verifier = { verify: async (t) => { if (t !== "casey") throw Object.assign(new Error("no"), { reason: "x" }); return { subject: "sub-casey", email: "c@x.invalid", emailVerified: true }; } };
  const app = createApp({ repository, catalog, accounts, verifier, runtime });
  await app.ready();
  const sets = {};
  const set = async (code, name, releaseDate) => { sets[code] = (await catalog.putExpansion({ game: "pokemon", code, name, releaseDate, printedTotal: 100 })).expansionId; return sets[code]; };
  const ctx = async (code, n, name, dex, { image = null, artist = "A", printings = 1, discriminator = "" } = {}) => {
    const { cardContextId } = await catalog.putCardContext({ game: "pokemon", expansionId: sets[code], collectorNumber: n, cardName: name,
      artist, rarity: "Rare", pokedexNumbers: dex, discriminator });
    for (let i = 0; i < printings; i += 1) {
      await catalog.putCanonicalCard({ cardContextId, finish: i ? "holofoil" : "non_holo", ...(image ? { imageSmall: image } : {}) });
    }
    return cardContextId;
  };
  return { app, catalog, set, ctx, sets, pg };
}
const get = async (app, url, token = "casey") => {
  const res = await app.inject({ method: "GET", url, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.statusCode, body: res.statusCode === 200 ? res.json() : res.body };
};

/* ============================================================== A */
describe("A. the Pokédex, derived from the catalogue", () => {
  test("one row per Pokédex number, its plainest name, its card count, in Pokédex order", async () => {
    const w = await world();
    await w.set("ex1", "Ruby & Sapphire", "2003-07-18"); await w.set("ex7", "Team Rocket Returns", "2004-11-08");
    await w.ctx("ex1", "60", "Mudkip", [258]);
    await w.ctx("ex7", "107", "Mudkip ☆", [258]);
    await w.ctx("ex7", "4", "Team Aqua's Mudkip", [258]);
    await w.ctx("ex1", "1", "Bulbasaur", [1]);
    await w.ctx("ex1", "90", "Professor Birch", []);                 // a trainer: no Pokémon
    const r = await w.catalog.findPokemon({});
    eq(json(r.pokemon.map((p) => [p.pokedexNumber, p.name, p.cardCount, p.generation])), json([[1, "Bulbasaur", 1, 1], [258, "Mudkip", 3, 3]]));
    eq(r.total, 2);
  });
  test("a card showing two Pokémon counts for both", async () => {
    const w = await world();
    await w.set("ex1", "Ruby & Sapphire", "2003-07-18");
    await w.ctx("ex1", "1", "Bulbasaur", [1]); await w.ctx("ex1", "2", "Squirtle", [7]);
    await w.ctx("ex1", "3", "Bulbasaur & Squirtle", [1, 7]);
    const r = await w.catalog.findPokemon({});
    eq(json(r.pokemon.map((p) => [p.name, p.cardCount])), json([["Bulbasaur", 2], ["Squirtle", 2]]));
  });
  test("its picture: the most recent card that has one, else the most recent card — deterministically", async () => {
    const w = await world();
    await w.set("old", "Old", "2003-01-01"); await w.set("mid", "Mid", "2010-01-01"); await w.set("new", "New", "2024-01-01");
    await w.ctx("old", "5", "Mudkip", [258], { image: "/img/old.png" });
    await w.ctx("mid", "9", "Mudkip", [258], { image: "/img/mid.png" });
    await w.ctx("new", "1", "Mudkip", [258]);                        // newest, but no picture
    const a = (await w.catalog.findPokemon({})).pokemon[0].face;
    eq(json([a.expansionName, a.collectorNumber, a.imageSmall]), json(["Mid", "9", "/img/mid.png"]));
    const b = (await w.catalog.findPokemon({})).pokemon[0].face;
    eq(json(a), json(b), "the same catalogue chose a different picture");
    const w2 = await world();
    await w2.set("old", "Old", "2003-01-01"); await w2.set("new", "New", "2024-01-01");
    await w2.ctx("old", "5", "Mudkip", [258]); await w2.ctx("new", "1", "Mudkip", [258]);
    const c = (await w2.catalog.findPokemon({})).pokemon[0].face;
    eq(json([c.expansionName, c.imageSmall]), json(["New", null]), "no picture anywhere: the most recent card");
  });
  test("generations are the prototype's National Pokédex ranges; filtering by one is server-side", async () => {
    const w = await world();
    await w.set("s", "S", "2020-01-01");
    for (const [n, name, dex] of [["1", "Mew", 151], ["2", "Chikorita", 152], ["3", "Mudkip", 258], ["4", "Pecharunt", 1025], ["5", "Future", 1026]]) {
      await w.ctx("s", n, name, [dex]);
    }
    const all = await w.catalog.findPokemon({});
    eq(json(all.pokemon.map((p) => p.generation)), json([1, 2, 3, 9, null]));
    eq(json(all.generations), json([1, 2, 3, 9]), "a number past every range is in no generation");
    eq(json((await w.catalog.findPokemon({ generation: 2 })).pokemon.map((p) => p.name)), json(["Chikorita"]));
    eq((await w.catalog.findPokemon({ generation: 9 })).total, 1);
  });
  test("searching narrows by name; paging is bounded and stable", async () => {
    const w = await world();
    await w.set("s", "S", "2020-01-01");
    for (let i = 1; i <= 30; i += 1) await w.ctx("s", String(i), i % 3 ? `Mon${i}` : `Mudmon${i}`, [i]);
    eq((await w.catalog.findPokemon({ query: "mud" })).total, 10);
    const p1 = await w.catalog.findPokemon({ pageSize: 12, page: 1 });
    const p3 = await w.catalog.findPokemon({ pageSize: 12, page: 3 });
    eq(p1.pokemon.length, 12); eq(p3.pokemon.length, 6); eq(p1.total, 30);
    const every = [];
    for (let pg = 1; pg <= 3; pg += 1) every.push(...(await w.catalog.findPokemon({ pageSize: 12, page: pg })).pokemon.map((p) => p.pokedexNumber));
    eq(json(every), json(Array.from({ length: 30 }, (_, i) => i + 1)), "pages overlap or skip");
    eq((await w.catalog.findPokemon({ pageSize: 5000 })).pageSize, 100, "a page is not capped");
  });
});

/* ============================================================== B */
describe("B. the printed number, exactly", () => {
  test("the same number in two sets: both, until a set narrows it", async () => {
    const w = await world();
    await w.set("base1", "Base", "1999-01-09"); await w.set("ex1", "Ruby & Sapphire", "2003-07-18");
    await w.ctx("base1", "4", "Charizard", [6]); await w.ctx("ex1", "4", "Blaziken", [257]);
    const both = await w.catalog.findCardContexts({ number: "4" });
    eq(json(both.contexts.map((c) => c.cardName).sort()), json(["Blaziken", "Charizard"]));
    const one = await w.catalog.findCardContexts({ number: "4", expansionId: w.sets.base1 });
    eq(json(one.contexts.map((c) => c.cardName)), json(["Charizard"]));
    eq((await w.catalog.findCardContexts({ number: "4", pokedex: "257" })).total, 1, "composes with the Pokémon too");
  });
  test("exact: 4 is 004, never 40, 14, 4a, TG04 or SV004", async () => {
    const w = await world();
    await w.set("s", "S", "2020-01-01");
    for (const n of ["4", "004", "40", "14", "4a", "TG04", "SV004"]) await w.ctx("s", n, `Card ${n}`, [1]);
    eq(json((await w.catalog.findCardContexts({ number: "4" })).contexts.map((c) => c.collectorNumber).sort()), json(["004", "4"]));
    eq(json((await w.catalog.findCardContexts({ number: "tg04" })).contexts.map((c) => c.collectorNumber)), json(["TG04"]), "letters: exact, any case");
    eq((await w.catalog.findCardContexts({ number: "4A" })).total, 1);
    eq((await w.catalog.findCardContexts({ number: "999" })).total, 0);
  });
  test("over HTTP: number= is passed through and logged as its own doorway", async () => {
    const w = await world();
    await w.set("s", "S", "2020-01-01"); await w.ctx("s", "25", "Pikachu", [25]);
    const r = await get(w.app, "/api/card-contexts?number=25");
    eq(r.status, 200); eq(r.body.total, 1);
    assert(/q\.number \? "number"/.test(fs.readFileSync(path.join(ROOT, "server/app.js"), "utf8")), "the doorway log does not name it");
  });
});

/* ============================================================== C */
describe("C. numeric-aware order inside a set", () => {
  test("1, 2, 4, 4a, 10, 11, 100, then TG01, TG2, TG10", async () => {
    const w = await world();
    await w.set("s", "S", "2020-01-01");
    for (const n of ["100", "TG10", "11", "4a", "2", "TG2", "10", "1", "4", "TG01"]) await w.ctx("s", n, `Card ${n}`, [1]);
    const r = await w.catalog.findCardContexts({ expansionId: w.sets.s, pageSize: 100 });
    eq(json(r.contexts.map((c) => c.collectorNumber)), json(["1", "2", "4", "4a", "10", "11", "100", "TG01", "TG2", "TG10"]));
  });
  test("ties are broken deterministically, so pages never overlap or skip", async () => {
    const w = await world();
    await w.set("s", "S", "2020-01-01");
    /* nine cards that agree on set, number AND name — only the id can order them */
    for (let i = 0; i < 9; i += 1) await w.ctx("s", "7", "Same", [1], { discriminator: `v${i}` });
    const whole = (await w.catalog.findCardContexts({ expansionId: w.sets.s, pageSize: 100 })).contexts.map((c) => c.cardContextId);
    const paged = [];
    for (let pg = 1; pg <= 3; pg += 1) paged.push(...(await w.catalog.findCardContexts({ expansionId: w.sets.s, pageSize: 3, page: pg })).contexts.map((c) => c.cardContextId));
    eq(json(paged), json(whole));
    eq(new Set(paged).size, 9);
  });
  test("sets are still ordered as they were (by code); only the order inside one changed", async () => {
    const w = await world();
    await w.set("b", "B", "2020-01-01"); await w.set("a", "A", "2021-01-01");
    await w.ctx("b", "1", "Bee", [1]); await w.ctx("a", "2", "Ay", [1]); await w.ctx("a", "10", "Ay10", [1]);
    eq(json((await w.catalog.findCardContexts({ pokedex: 1 })).contexts.map((c) => c.cardName)), json(["Ay", "Ay10", "Bee"]));
  });
});

/* ============================================================== D */
describe("D. the door", () => {
  test("GET /api/pokemon: authenticated, MetYet's vocabulary, no provider", async () => {
    const w = await world();
    await w.set("ex1", "Ruby & Sapphire", "2003-07-18"); await w.ctx("ex1", "60", "Mudkip", [258], { image: "/img/m.png" });
    eq((await get(w.app, "/api/pokemon", null)).status, 401, "anyone could read it");
    const r = await get(w.app, "/api/pokemon?generation=3&query=mud&pageSize=10");
    eq(r.status, 200);
    eq(json(Object.keys(r.body).sort()), json(["generations", "page", "pageSize", "pokemon", "total"]));
    eq(json(Object.keys(r.body.pokemon[0]).sort()), json(["cardCount", "face", "generation", "name", "pokedexNumber"]));
    eq(json(Object.keys(r.body.pokemon[0].face).sort()), json(["cardContextId", "cardName", "collectorNumber", "expansionName", "imageSmall"]));
    assert(!/tcgdex|pokemontcg|provider|source/i.test(JSON.stringify(r.body)), "a provider leaked");
  });
  test("nothing written: no command, no migration, the production door unchanged", () => {
    /* P6-F4 B5: + changeCollectingState; M2D.1: + sendDealMessage — each founder-approved */ eq(EXPOSED_COMMANDS.length, 31);
    const migrations = fs.readdirSync(path.join(ROOT, "persistence/migrations"));
    assert(!migrations.some((m) => /pokemon|pokedex_list|f2/i.test(m)), "a migration was added");
    const repo = fs.readFileSync(path.join(ROOT, "persistence/catalog-repository.js"), "utf8");
    const body = repo.slice(repo.indexOf("async findPokemon"), repo.indexOf("/* THE SET DOORWAY'S OWN LIST"));
    assert(!/\b(insert|update|delete)\b/i.test(body.replace(/\/\*[\s\S]*?\*\//g, "")), "the Pokédex read writes");
  });
});

/* ============================================================== E */
describe("E. at catalogue scale", () => {
  test("20,000 cards: the Pokédex and a numbered search stay bounded and quick", async () => {
    const w = await world();
    await w.set("s", "S", "2020-01-01");
    /* bulk, straight into the tables: 20,000 contexts over 1,025 Pokémon, half with a picture */
    await w.pg.exec(`
      insert into metyet_catalog.card_contexts (card_context_id, expansion_id, collector_number, card_name, natural_key, pokedex_numbers)
      select 'cx' || g, '${w.sets.s}', (g % 400)::text, 'Mon' || (g % 1025 + 1), 'nk' || g, jsonb_build_array(g % 1025 + 1)
      from generate_series(1, 20000) g;
      insert into metyet_catalog.canonical_cards (canonical_card_id, card_context_id, print_run, finish, language, natural_key, image_small)
      select 'cc' || g, 'cx' || g, 'unlimited', 'non_holo', 'en', 'cnk' || g, case when g % 2 = 0 then '/img/' || g || '.png' end
      from generate_series(1, 20000) g;`);
    let t = Date.now();
    const dex = await w.catalog.findPokemon({ pageSize: 60 });
    const dexMs = Date.now() - t;
    eq(dex.total, 1025); eq(dex.pokemon.length, 60);
    t = Date.now();
    const gen = await w.catalog.findPokemon({ generation: 1, pageSize: 100, page: 2 });
    const genMs = Date.now() - t;
    eq(gen.total, 151); eq(gen.pokemon.length, 51);
    t = Date.now();
    const num = await w.catalog.findCardContexts({ number: "7", pageSize: 60 });
    const numMs = Date.now() - t;
    eq(num.total, 50); eq(num.contexts.length, 50);
    console.log(`      measured on PGlite: Pokédex page ${dexMs} ms · generation page ${genMs} ms · number search ${numMs} ms`);
    assert(dexMs < 5000 && genMs < 5000 && numMs < 5000, "too slow to browse");
  });
});

run();
