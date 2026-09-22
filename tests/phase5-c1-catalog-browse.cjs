/* ============================================================================
   PHASE 5 C1 — CATALOG, BROWSE AND CARD ENTRY

   Every batch since B5 has been able to name a card exactly and unable to help
   anybody find one. This is the finding.

   The shape of it: one browser, three doorways, composed by both seats and
   owned by neither. A Collector browses as a place they spend time and says
   "I'm looking for this" while they are there; a Trusted Partner reaches the
   same browser from Inventory and ends somewhere else entirely, because they
   are saying what is on the shelf.

   WHAT THIS BATCH IS NOT is most of what it could have been. No Binder, no
   Intent grammar, no Sell/Trade, no defaults, no drafts, no bookmarks, no
   queue. Browsing writes nothing and cancelling writes nothing, and the two
   commands at the end of it are the two that already existed.

   A. the doorways      Pokémon, set and artist, in MetYet's own ids
   B. the grid          images, paging, and what a missing picture looks like
   C. the Collector     browse, specify, commit — and the two ways in that meet
   D. cancel            the thing that must leave no trace
   E. the Trusted Partner   the same browser, a different ending
   F. the session       come back to where you were
   G. boundaries        what the seats may see, and what did not change
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const React = require("react");
const TR = require("react-test-renderer");
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
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const json = (v) => JSON.stringify(v);

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

const SUBJECT = { north: "sub-north", casey: "sub-casey" };

function capturingLogger() {
  const lines = [];
  const record = (level) => (a, b) => {
    const [fields, message] = typeof a === "string" ? [{}, a] : [a || {}, b];
    lines.push({ level, message, fields });
  };
  const logger = { lines, level: "info",
    fatal: record("fatal"), error: record("error"), warn: record("warn"),
    info: record("info"), debug: record("debug"), trace: record("trace"),
    silent() {}, child() { return logger; } };
  return logger;
}
const said = (logger, message) => logger.lines.filter((l) => l.message === message);

async function world() {
  const pg = database();
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  const runtime = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 1000 });
  const repository = createWorldRepository(db);
  const catalog = createCatalogRepository(db, { newId: runtime.newId });
  await repository.saveWorld({
    catalog: [],
    collectors: [{ id: "c1", name: "Casey" }],
    partners: [{ id: "p1", name: "Northline" }, { id: "p2", name: "Second" }],
    relationships: [{ partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" }],
    invitations: [], goals: [], inventory: [], collectorCopies: [], binders: [], binderEntries: [], interests: [],
    opportunities: [], conversations: [], photoRequests: [], copyReviews: [],
  });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: SUBJECT.north, role: "tp", partnerId: "p1" });
  await accounts.linkAccount({ subject: SUBJECT.casey, role: "collector", collectorId: "c1" });
  const verifier = { verify: async (token) => {
    const subject = SUBJECT[token];
    if (!subject) throw Object.assign(new Error("no"), { reason: "bad token" });
    return { subject, email: `${token}@example.invalid`, emailVerified: true };
  } };
  const logger = capturingLogger();
  return { pg, db, runtime, repository, catalog, logger,
    app: createApp({ repository, catalog, accounts, verifier, runtime, logger }) };
}

/* A catalogue big enough to have doorways worth walking through: two releases,
   two artists, a Pokémon that appears in both sets, and one context with no
   picture at all so the grid can be asked what it does about that. */
async function shelfOfCards(ctx) {
  const base = await ctx.catalog.putExpansion(
    { game: "pokemon", code: "base1", name: "Base Set", series: "Original", printedTotal: 102,
      releaseDate: "1999-01-09" });
  const jungle = await ctx.catalog.putExpansion(
    { game: "pokemon", code: "jungle", name: "Jungle", series: "Original", printedTotal: 64,
      releaseDate: "1999-06-16" });
  const made = {};
  const line = async (key, expansionId, over) => {
    const { cardContextId } = await ctx.catalog.putCardContext({ game: "pokemon", expansionId, ...over });
    made[key] = { cardContextId, cards: [] };
    return cardContextId;
  };
  const printing = async (key, cardContextId, over) => {
    const { canonicalCardId } = await ctx.catalog.putCanonicalCard({ cardContextId, ...over });
    made[key].cards.push(canonicalCardId);
    return canonicalCardId;
  };

  const charizard = await line("charizard", base.expansionId,
    { collectorNumber: "4", cardName: "Charizard", artist: "Mitsuhiro Arita", pokedexNumbers: [6] });
  await printing("charizard", charizard,
    { printRun: "first_edition", finish: "holofoil", imageSmall: "img/charizard-1st.png" });
  await printing("charizard", charizard,
    { printRun: "unlimited", finish: "holofoil", imageSmall: "img/charizard-unl.png" });

  const blastoise = await line("blastoise", base.expansionId,
    { collectorNumber: "2", cardName: "Blastoise", artist: "Ken Sugimori", pokedexNumbers: [9] });
  await printing("blastoise", blastoise,
    { printRun: "unlimited", finish: "holofoil", imageSmall: "img/blastoise.png" });

  /* The same Pokémon, a different release, a different artist. */
  const flareon = await line("flareon", jungle.expansionId,
    { collectorNumber: "3", cardName: "Flareon", artist: "Mitsuhiro Arita", pokedexNumbers: [136] });
  await printing("flareon", flareon, { printRun: "unlimited", finish: "holofoil" });

  /* No image anywhere on this one, on purpose. */
  const meowth = await line("meowth", jungle.expansionId,
    { collectorNumber: "56", cardName: "Meowth", artist: "Ken Sugimori", pokedexNumbers: [52] });
  await printing("meowth", meowth, { printRun: "unlimited", finish: "non_holo" });

  return { ...made, baseId: base.expansionId, jungleId: jungle.expansionId };
}

const get = (app, token, url) => app.inject({ method: "GET", url,
  headers: { authorization: `Bearer ${token}` } });
const post = (app, token, command, payload) => app.inject({ method: "POST", url: "/api/commands",
  headers: { authorization: `Bearer ${token}` }, payload: { command, payload } });
const browse = async (ctx, token, query = "") => {
  const res = await get(ctx.app, token, `/api/card-contexts${query ? `?${query}` : ""}`);
  eq(res.statusCode, 200, res.body);
  return res.json();
};
const names = (answer) => answer.contexts.map((c) => c.cardName).sort().join(",");

/* ============================================================== A */
describe("A. the three doorways, in MetYet's own ids", () => {

  test("the Pokémon doorway finds a card by name, including halfway through it", async () => {
    const ctx = await world();
    await shelfOfCards(ctx);
    eq(names(await browse(ctx, "casey", "query=Charizard")), "Charizard");
    /* The one this batch is named for: a prefix search never found this. */
    eq(names(await browse(ctx, "casey", "query=zard")), "Charizard", "a substring did not match");
    eq(names(await browse(ctx, "casey", "query=CHARIZ")), "Charizard", "case mattered");
    eq(names(await browse(ctx, "casey", "query=nothinglikethat")), "", "it matched something anyway");
  });

  test("and by Pokédex number, which the catalog has always stored and never answered", async () => {
    const ctx = await world();
    await shelfOfCards(ctx);
    eq(names(await browse(ctx, "casey", "pokedex=6")), "Charizard");
    eq(names(await browse(ctx, "casey", "pokedex=9")), "Blastoise");
    eq(names(await browse(ctx, "casey", "pokedex=151")), "", "a number nothing carries");
    /* A number that is not one is not a filter that matches everything. */
    eq(names(await browse(ctx, "casey", "pokedex=abc")), "Blastoise,Charizard,Flareon,Meowth",
      "a non-numeric pokedex became a filter");
  });

  test("the set doorway lists releases, newest first, with what is in them", async () => {
    const ctx = await world();
    const made = await shelfOfCards(ctx);
    const res = await get(ctx.app, "casey", "/api/expansions");
    eq(res.statusCode, 200, res.body);
    const { expansions, total } = res.json();
    eq(total, 2);
    eq(expansions.map((e) => e.name).join(","), "Jungle,Base Set", "not newest first");
    eq(expansions.find((e) => e.code === "base1").cardCount, 2, "Base Set's checklist");
    /* And a set narrows the grid, by MetYet's id. */
    eq(names(await browse(ctx, "casey", `expansionId=${encodeURIComponent(made.jungleId)}`)),
      "Flareon,Meowth");
    /* Or by the name a person would type, which no id is. */
    eq(names(await browse(ctx, "casey", "expansion=jungle")), "Flareon,Meowth");
    eq(names(await browse(ctx, "casey", "expansion=base1")), "Blastoise,Charizard", "by code");
  });

  test("the artist doorway lists who drew what", async () => {
    const ctx = await world();
    await shelfOfCards(ctx);
    const res = await get(ctx.app, "casey", "/api/artists");
    eq(res.statusCode, 200, res.body);
    const { artists } = res.json();
    eq(artists.map((a) => `${a.artist}:${a.cardCount}`).join(","),
      "Ken Sugimori:2,Mitsuhiro Arita:2");
    eq(names(await browse(ctx, "casey", "artist=Mitsuhiro%20Arita")), "Charizard,Flareon",
      "an artist spans the sets they drew for");
  });

  test("doorways combine, and narrow rather than widen", async () => {
    const ctx = await world();
    const made = await shelfOfCards(ctx);
    eq(names(await browse(ctx, "casey",
      `artist=Mitsuhiro%20Arita&expansionId=${encodeURIComponent(made.baseId)}`)), "Charizard");
    eq(names(await browse(ctx, "casey", "artist=Ken%20Sugimori&pokedex=6")), "",
      "two filters became an either/or");
  });

  test("nothing a provider ever called anything reaches a caller", async () => {
    const ctx = await world();
    const made = await shelfOfCards(ctx);
    await ctx.catalog.recordSourceMapping({
      provider: "some-provider", status: "mapped", providerCardId: "PROVIDER-CARD-9999",
      providerExpansionId: "PROVIDER-SET-1", canonicalCardId: made.charizard.cards[0],
      raw: { note: "PROVIDER-RAW-BLOB" } });
    const bodies = [
      (await get(ctx.app, "casey", "/api/card-contexts?query=Charizard")).body,
      (await get(ctx.app, "casey", "/api/expansions")).body,
      (await get(ctx.app, "casey", "/api/artists")).body,
      (await get(ctx.app, "casey", `/api/card-contexts/${made.charizard.cardContextId}`)).body,
    ];
    for (const body of bodies) {
      for (const leak of ["PROVIDER-CARD-9999", "PROVIDER-SET-1", "PROVIDER-RAW-BLOB",
        "some-provider", "natural_key", "naturalKey"]) {
        assert(!body.includes(leak), `"${leak}" reached a caller`);
      }
    }
  });
});

/* ============================================================== B */
describe("B. the grid: pictures, paging, and the cards that have none", () => {

  test("a row carries a picture, and the same one every time", async () => {
    const ctx = await world();
    await shelfOfCards(ctx);
    const first = (await browse(ctx, "casey", "query=Charizard")).contexts[0];
    const again = (await browse(ctx, "casey", "query=Charizard")).contexts[0];
    assert(first.imageSmall, "a card with two illustrated printings showed no picture");
    eq(first.imageSmall, again.imageSmall, "the representative picture moved between reads");
    /* One picture per piece of artwork — not one per printing. */
    eq((await browse(ctx, "casey", "query=Charizard")).total, 1,
      "two printings became two tiles");
  });

  test("a card with no picture is still a card", async () => {
    const ctx = await world();
    await shelfOfCards(ctx);
    const meowth = (await browse(ctx, "casey", "query=Meowth")).contexts[0];
    eq(meowth.imageSmall, null, "an image appeared from somewhere");
    eq(meowth.cardName, "Meowth", "and the row is still there to be drawn");
  });

  test("paging is real, bounded, and says how much there is", async () => {
    const ctx = await world();
    await shelfOfCards(ctx);
    const one = await browse(ctx, "casey", "pageSize=2&page=1");
    const two = await browse(ctx, "casey", "pageSize=2&page=2");
    eq(one.total, 4); eq(two.total, 4);
    eq(one.contexts.length, 2); eq(two.contexts.length, 2);
    eq(json(one.contexts.map((c) => c.cardContextId)
      .filter((id) => two.contexts.some((c) => c.cardContextId === id))), json([]),
      "the two pages overlap");
    const huge = await browse(ctx, "casey", "pageSize=100000");
    eq(huge.pageSize, 100, "the ceiling a caller cannot argue with");
  });
});

/* ============================================================== C */
describe("C. the Collector: browse, specify, commit", () => {

  const load = (rel) => {
    const out = esbuild.buildSync({
      entryPoints: [path.join(ROOT, rel)],
      bundle: true, format: "cjs", write: false, logLevel: "silent", jsx: "automatic",
      external: ["react", "react-dom", "react/jsx-runtime"],
      define: { "process.env.NODE_ENV": '"production"' },
    });
    const mod = { exports: {} };
    new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
    return mod.exports;
  };
  const Shell = load("client/collector/CollectorShell.jsx").default;
  const instText = (node) => {
    const out = [];
    const walk = (n) => {
      if (typeof n === "string" || typeof n === "number") { out.push(String(n)); return; }
      if (!n || !Array.isArray(n.children)) return;
      n.children.forEach(walk);
    };
    walk(node);
    return out.join(" ");
  };
  const texts = (r) => {
    const out = [];
    const walk = (n) => {
      if (n && n.type === "style") return;
      for (const c of (n && n.children) || []) {
        if (typeof c === "string" || typeof c === "number") out.push(String(c)); else walk(c);
      }
    };
    walk(r.toJSON());
    return out.join(" ").replace(/\s+/g, " ");
  };
  const buttons = (r) => r.root.findAll((n) => n.type === "button");
  /* A click starts real work — a catalog read, a command — and React's `act`
     only awaits its own callback, not the promise an onClick handler drops. So
     every interaction is followed by letting the event loop actually turn. */
  const settle = async (r) => {
    for (let i = 0; i < 4; i += 1) {
      await TR.act(async () => { await new Promise((done) => setTimeout(done, 0)); });
    }
  };
  const press = async (r, label) => {
    const b = buttons(r).find((n) => instText(n).trim() === label
      || instText(n).includes(label) || (n.props["aria-label"] || "") === label);
    assert(b, `no button "${label}" among: ${buttons(r).map(instText).join(" | ")}`);
    await TR.act(async () => { b.props.onClick(); });
    await settle(r);
  };
  const typeInto = async (r, id, value) => {
    const input = r.root.findAll((n) => n.type === "input").find((n) => n.props.id === id);
    assert(input, `no input ${id}`);
    await TR.act(async () => { input.props.onChange({ target: { value } }); });
    await settle(r);
  };

  /* A browse door wired to the real catalog repository, which is what the real
     store's `browseCards` is a thin wrapper over. */
  const doorFor = (ctx) => ({
    find: async (query) => {
      const p = new URLSearchParams(query);
      return ctx.catalog.findCardContexts(Object.fromEntries(p.entries()));
    },
    read: async (id) => {
      const found = await ctx.catalog.readCardContext(id);
      return found ? { ...found.context, canonicalCards: found.canonicalCards } : null;
    },
    describe: async (ids) => ({ cards: await ctx.catalog.describeCanonicalCards(ids) }),
    expansions: async (query) => ctx.catalog.findExpansions(
      Object.fromEntries(new URLSearchParams(query).entries())),
    artists: async (query) => ctx.catalog.findArtists(
      Object.fromEntries(new URLSearchParams(query).entries())),
  });

  const projection = async (ctx, token) => (await get(ctx.app, token, "/api/view")).json().state;

  /* Renders the Collector's shell on Browse, with a real catalog behind it.

     THE CALLBACK CHANGED SHAPE IN C3.3, and so did this helper. Browse used to
     be handed `onAddGoal` and could create exactly one kind of record; it is now
     handed `onSpecify`, which receives one STEP of the sequence the Card
     Specification panel composes. The tests below still drive the real
     component through the real server — what moved is the name of the door, not
     whether one is used. */
  const browsing = async (ctx, onSpecify) => {
    const state = await projection(ctx, "casey");
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(Shell,
        { state, onSignOut() {}, onSpecify, onBrowseCards: doorFor(ctx) }));
    });
    return r;
  };

  /* The panel's want control plus Save, which is what "says they are looking for
     it" means from C3.3 onwards. A canonical Goal states which copy it wants, so
     stating one is part of the flow rather than an extra step. */
  const sayWanted = async (r, label, grade = "PSA 9") => {
    await press(r, label);
    const select = r.root.findAll((n) => n.type === "label")
      .find((n) => instText(n).includes("Grade wanted"));
    assert(select, "the panel did not ask which copy is wanted");
    const el = select.findAll((n) => n.type === "select")[0];
    await TR.act(async () => { el.props.onChange({ target: { value: grade } }); });
    await settle(r);
    await press(r, "Save");
  };

  /* SUPERSEDED BY C3.3 AND RESTATED. What this protected: that a person finds a
     card by browsing, opens it, says they are looking for it, and ONE command
     goes out — at the end, naming the exact canonical card. Every part of that
     still holds. What changed is the control: C1 offered two buttons that each
     committed a tier, and C3.3 replaces them with a want control and a Save,
     because the same panel now also files the card and records copies. The
     assertions are the same claims through the new control, plus one C1 could
     not make: the Goal states which copy is wanted. */
  test("a Collector finds a card, opens it, and says they are looking for it", async () => {
    const ctx = await world();
    const made = await shelfOfCards(ctx);
    const sent = [];
    const onSpecify = async (step, canonicalCardId) => {
      sent.push({ ...step, canonicalCardId });
      return (await post(ctx.app, "casey", "addGoal",
        { canonicalCardId, tier: step.tier, desired: step.desired })).json();
    };
    const r = await browsing(ctx, onSpecify);
    await typeInto(r, "mcs-br-q", "Blastoise");
    assert(texts(r).includes("Blastoise"), "the grid did not fill: " + texts(r));

    await press(r, "Blastoise");
    assert(texts(r).includes("Base Set"), "the card did not open: " + texts(r));
    /* One printing is not a choice, so there is nothing to ask. */
    await sayWanted(r, "Actively hunting");

    eq(sent.length, 1, "one command, and only at the end");
    /* The panel speaks its own words — a Collector surface may not name a
       command — and the entrance maps them. "start-looking" is what it says
       when there was no Goal and now there is. */
    eq(sent[0].kind, "start-looking");
    eq(sent[0].canonicalCardId, made.blastoise.cards[0], "the exact canonical card");
    eq(sent[0].tier, "primary");
    const goals = (await ctx.repository.loadWorld()).goals;
    eq(goals.length, 1, "one goal");
    eq(goals[0].canonicalCardId, made.blastoise.cards[0]);
    assert(goals[0].createdAt, "and it is a real goal, stamped like any other");
    eq(json(goals[0].desired), json({ grade: "PSA 9" }), "and it says which copy");
  });

  test("the `+` and the card reach the same place", async () => {
    const ctx = await world();
    await shelfOfCards(ctx);
    const r = await browsing(ctx, async () => ({ ok: true }));
    await typeInto(r, "mcs-br-q", "Blastoise");
    /* The fast path. */
    await press(r, "Add Blastoise");
    const viaPlus = texts(r);
    assert(viaPlus.includes("Are you looking for it?"),
      "`+` did not open specification: " + viaPlus);
    await press(r, "Cancel");
    /* And the slow one. */
    await press(r, "Blastoise");
    const viaCard = texts(r);
    assert(viaCard.includes("Are you looking for it?"), "the card did not open specification");
    eq(viaPlus, viaCard, "the two ways in show different things");
  });

  test("a card with several printings asks which, and will not commit until told", async () => {
    const ctx = await world();
    const made = await shelfOfCards(ctx);
    const sent = [];
    const r = await browsing(ctx, async (p) => { sent.push(p); return { ok: true }; });
    await typeInto(r, "mcs-br-q", "Charizard");
    await press(r, "Charizard");
    const shown = texts(r);
    /* RESTATED (C3.3): the question is "Which one?" rather than "Which one are
       you looking for?", because the panel it opens is no longer only about
       looking — the same choice decides which card is filed and which card a
       copy is a copy of. */
    assert(/Which one\?/.test(shown), "it did not ask: " + shown);

    /* And nothing else is offered until it is answered: C1 asserted this by
       finding a disabled commit button, which is a stronger statement when the
       controls are not rendered at all. */
    assert(!/Are you looking for it\?/.test(shown),
      "it offered to specify a card before knowing which printing: " + shown);
    await press(r, "first_edition");
    await sayWanted(r, "Actively hunting");
    eq(sent.length, 1);
    eq(sent[0].canonicalCardId || made.charizard.cards[0], made.charizard.cards[0],
      "the printing that was chosen");
  });

  test("Secondary is the same road to the same kind of record", async () => {
    const ctx = await world();
    const made = await shelfOfCards(ctx);
    const r = await browsing(ctx, async (step, canonicalCardId) =>
      (await post(ctx.app, "casey", "addGoal",
        { canonicalCardId, tier: step.tier, desired: step.desired })).json());
    await typeInto(r, "mcs-br-q", "Blastoise");
    await press(r, "Blastoise");
    await sayWanted(r, "Keeping an eye out");
    const goals = (await ctx.repository.loadWorld()).goals;
    eq(goals.length, 1);
    eq(goals[0].tier, "secondary", "keeping an eye out is still explicit demand");
    eq(goals[0].canonicalCardId, made.blastoise.cards[0]);
  });

  test("a Collector is told how many of their partners have it — and who is never named", async () => {
    const ctx = await world();
    const made = await shelfOfCards(ctx);
    /* Northline is theirs; Second is not. Both stock the card. */
    await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: made.blastoise.cards[0], ask: 900, cost: 400, cert: "TP-CERT-1" } });
    const r = await browsing(ctx, async () => ({ ok: true }));
    await typeInto(r, "mcs-br-q", "Blastoise");
    await press(r, "Blastoise");
    const shown = texts(r);
    assert(shown.includes("1 of your Trusted Partners has this."), "the count: " + shown);
    assert(!shown.includes("Northline"), "the partner was named");
    assert(!shown.includes("900") && !shown.includes("400") && !shown.includes("TP-CERT-1"),
      "a partner's own figures reached the Collector: " + shown);
  });

  test("a card already on the list says so instead of offering to ask again", async () => {
    const ctx = await world();
    const made = await shelfOfCards(ctx);
    await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: made.blastoise.cards[0], tier: "primary", desired: { grade: "PSA 9" } });
    const r = await browsing(ctx, async () => ({ ok: true }));
    await typeInto(r, "mcs-br-q", "Blastoise");
    await press(r, "Blastoise");
    /* RESTATED (C3.3). C1 answered "you already want this" by refusing to offer
       the control again, which was right when the panel could do one thing. The
       panel now opens on CURRENT TRUTH: the want it already holds is the one
       selected, so there is nothing to add twice — and the person can still
       change it, which they could not before. That is a stronger property than
       a hidden button, and it is what is asserted. */
    const shown = texts(r);
    assert(shown.includes("Are you looking for it?"), shown);
    const hunting = buttons(r).find((b) => instText(b).trim() === "Actively hunting");
    assert(hunting && hunting.props["aria-pressed"] === true,
      "the panel did not open on what the Collector already said: " + shown);
    /* And Save has nothing to do, because nothing has been changed yet. */
    const save = buttons(r).find((b) => instText(b).trim() === "Save");
    assert(save && save.props.disabled, "an unchanged card offered to write something");
  });
});

/* ============================================================== D */
describe("D. cancel, and everything short of the last button", () => {

  test("browsing writes nothing at all", async () => {
    const ctx = await world();
    await shelfOfCards(ctx);
    const before = await ctx.repository.loadWorld();
    const beforeVersion = (await get(ctx.app, "casey", "/api/view")).json().version;
    for (const q of ["query=zard", "pokedex=6", "artist=Ken%20Sugimori", "pageSize=2&page=2"]) {
      await browse(ctx, "casey", q);
    }
    await get(ctx.app, "casey", "/api/expansions");
    await get(ctx.app, "casey", "/api/artists");
    const after = await ctx.repository.loadWorld();
    eq(json(after), json(before), "the world moved while somebody was looking at cards");
    eq((await get(ctx.app, "casey", "/api/view")).json().version, beforeVersion,
      "the world's version moved");
  });

  test("opening a card and cancelling leaves no goal, no draft and no trace", async () => {
    const ctx = await world();
    await shelfOfCards(ctx);
    const sent = [];
    const load = (rel) => {
      const out = esbuild.buildSync({ entryPoints: [path.join(ROOT, rel)], bundle: true,
        format: "cjs", write: false, logLevel: "silent", jsx: "automatic",
        external: ["react", "react-dom", "react/jsx-runtime"],
        define: { "process.env.NODE_ENV": '"production"' } });
      const mod = { exports: {} };
      new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
      return mod.exports;
    };
    const Browse = load("client/collector/sections/Browse.jsx").default;
    const state = (await get(ctx.app, "casey", "/api/view")).json().state;
    let session = load("client/browse/CardBrowser.jsx").EMPTY_SESSION;
    let r;
    const door = {
      find: async (q) => ctx.catalog.findCardContexts(
        Object.fromEntries(new URLSearchParams(q).entries())),
      read: async (id) => {
        const f = await ctx.catalog.readCardContext(id);
        return f ? { ...f.context, canonicalCards: f.canonicalCards } : null;
      },
      describe: async () => ({ cards: [] }),
      expansions: async () => ({ expansions: [] }),
      artists: async () => ({ artists: [] }),
    };
    const draw = async () => {
      await TR.act(async () => {
        const el = React.createElement(Browse, { state, session,
          onSession: (next) => { session = next; draw(); },
          onAddGoal: async (p) => { sent.push(p); return { ok: true }; }, onBrowseCards: door });
        if (r) r.update(el); else r = TR.create(el);
      });
    };
    await draw();
    const input = r.root.findAll((n) => n.type === "input").find((n) => n.props.id === "mcs-br-q");
    await TR.act(async () => { input.props.onChange({ target: { value: "Blastoise" } }); });
    await draw();
    const card = r.root.findAll((n) => n.type === "button")
      .find((b) => (b.props["aria-label"] || "") === "Add Blastoise");
    await TR.act(async () => { card.props.onClick(); });
    const cancel = r.root.findAll((n) => n.type === "button")
      .find((b) => (b.children || []).join("") === "Cancel");
    assert(cancel, "no way to cancel");
    await TR.act(async () => { cancel.props.onClick(); });

    eq(sent.length, 0, "cancelling sent a command");
    eq((await ctx.repository.loadWorld()).goals.length, 0, "cancelling created a goal");
    /* And there is nowhere a draft could have been kept. */
    const { rows } = await ctx.db.transaction((tx) => tx.query(
      "select table_name from information_schema.tables where table_schema in ('metyet','metyet_auth')"),
    { readOnly: true });
    const drafts = rows.map((t) => t.table_name)
      .filter((n) => /draft|bookmark|pending|queue|saved/i.test(n));
    eq(json(drafts), json([]), "a place to keep a half-made card appeared: " + drafts.join(", "));
  });

  test("no amount of browsing produces a discovery", async () => {
    const ctx = await world();
    const made = await shelfOfCards(ctx);
    /* A partner has the card. Nobody has said they want it. */
    await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: made.blastoise.cards[0], ask: 900 } });
    for (const q of ["query=Blastoise", "pokedex=9", "artist=Ken%20Sugimori"]) {
      await browse(ctx, "casey", q);
    }
    await get(ctx.app, "casey", `/api/card-contexts/${made.blastoise.cardContextId}`);
    for (const token of ["casey", "north"]) {
      const state = (await get(ctx.app, token, "/api/view")).json().state;
      eq(state.discoveries.length, 0, `${token} was shown a discovery for a card nobody wants`);
    }
    /* And the moment somebody actually says it, one appears — so the zero above
       is the absence of demand, not a broken join. */
    await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: made.blastoise.cards[0], tier: "primary", desired: { grade: "PSA 9" } });
    eq((await get(ctx.app, "casey", "/api/view")).json().state.discoveries.length, 1);
  });
});

/* ============================================================== E */
describe("E. the Trusted Partner: the same browser, a different ending", () => {

  test("Inventory reaches the shared browser, and has no fast path", () => {
    const inventory = code("client/tp/sections/Inventory.jsx");
    assert(/from ["']\.\.\/\.\.\/browse\/CardBrowser\.jsx["']/.test(inventory),
      "Inventory does not use the shared browser");
    assert(/fastAdd=\{false\}/.test(inventory), "a Trusted Partner was given a `+`");
    /* And it did not keep a copy of the picker it replaced. */
    assert(!/card-contexts\?|browse\.find\(`query=/.test(inventory),
      "Inventory still composes its own catalog query");
  });

  test("a copy cannot be added before an exact card is resolved", async () => {
    const ctx = await world();
    const made = await shelfOfCards(ctx);
    /* A context is not a card: the command takes canonical ids and nothing else. */
    const byContext = await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: made.charizard.cardContextId, ask: 900 } });
    eq(byContext.statusCode, 409, byContext.body);
    eq(byContext.json().error.refused, "card-unavailable");
    const byCard = await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: made.charizard.cards[1], ask: 900, grade: "PSA 9" } });
    eq(byCard.statusCode, 200, byCard.body);
    const copy = (await ctx.repository.loadWorld()).inventory[0];
    eq(copy.canonicalCardId, made.charizard.cards[1], "the exact printing");
    eq(copy.partnerId, "p1");
    eq(copy.archived, false, "and it is on the shelf");
    eq(copy.grade, "PSA 9");
  });

  test("both seats browse the same catalog through the same component", () => {
    const shared = "client/browse/CardBrowser.jsx";
    assert(fs.existsSync(path.join(ROOT, shared)), "there is no shared browser");
    for (const rel of ["client/collector/sections/Browse.jsx", "client/tp/sections/Inventory.jsx"]) {
      assert(/CardBrowser/.test(code(rel)), `${rel} does not use it`);
    }
    /* And neither seat kept its own. The duplicated picker is gone from the
       Collector's Goals section too. */
    const goals = code("client/collector/sections/Goals.jsx");
    const inventory = code("client/tp/sections/Inventory.jsx");
    for (const [rel, body] of [["Goals.jsx", goals], ["Inventory.jsx", inventory]]) {
      assert(!/pageSize=20/.test(body), `${rel} still has the old picker's query`);
    }
  });

  test("the shared browser can neither write nor reach a command", () => {
    const body = code("client/browse/CardBrowser.jsx");
    assert(!/execute\(|api\.|fetch\(|addGoal|addInventoryCopy|command/.test(body),
      "the browser learned to write");
    assert(!/localStorage|sessionStorage|document\.cookie/.test(body),
      "the browser learned to remember things outside the session");
    assert(!/metyet-|domain\//.test(body), "the browser reached into the domain");
  });
});

/* ============================================================== F */
describe("F. the browsing session", () => {

  const CARD_BROWSER = read("client/browse/CardBrowser.jsx");
  const SHELL = read("client/collector/CollectorShell.jsx");

  test("the session is the caller's, so nothing here can reset it", () => {
    assert(/session, onSession/.test(CARD_BROWSER), "the browser owns its own state");
    const body = code("client/browse/CardBrowser.jsx");
    assert(!/useState\(EMPTY_SESSION\)|setSession\(EMPTY_SESSION\)/.test(body),
      "the browser resets the session it was given");
  });

  test("the Collector's session lives above the section, so leaving and coming back keeps it", () => {
    assert(/const \[browseSession, setBrowseSession\] = useState\(EMPTY_SESSION\)/.test(SHELL),
      "the session is not held above the section");
    assert(/session: browseSession, onSession: setBrowseSession/.test(SHELL),
      "the session is not handed to Browse");
  });

  test("a session says exactly what it was asked, and the same session asks it again", () => {
    const mod = (() => {
      const out = esbuild.buildSync({
        entryPoints: [path.join(ROOT, "client", "browse", "CardBrowser.jsx")],
        bundle: true, format: "cjs", write: false, logLevel: "silent", jsx: "automatic",
        external: ["react", "react-dom", "react/jsx-runtime"],
        define: { "process.env.NODE_ENV": '"production"' } });
      const m = { exports: {} };
      new Function("module", "exports", "require", out.outputFiles[0].text)(m, m.exports, require);
      return m.exports;
    })();
    const { EMPTY_SESSION, browseQuery, DOORWAYS } = mod;
    eq(DOORWAYS.map((d) => d.id).join(","), "pokemon,set,artist");
    const looking = { ...EMPTY_SESSION, query: "zard", page: 3 };
    eq(browseQuery(looking), "page=3&pageSize=24&query=zard");
    eq(browseQuery(looking), browseQuery(looking), "the same session asked two different questions");
    /* A doorway asks its own question and nobody else's. */
    eq(browseQuery({ ...EMPTY_SESSION, doorway: "set", expansionId: "e1" }),
      "page=1&pageSize=24&expansionId=e1");
    eq(browseQuery({ ...EMPTY_SESSION, doorway: "artist", artist: "Ken Sugimori" }),
      "page=1&pageSize=24&artist=Ken%20Sugimori");
    /* Text typed into one doorway does not leak into another's query. */
    eq(browseQuery({ ...EMPTY_SESSION, doorway: "set", query: "zard", expansionId: "e1" }),
      "page=1&pageSize=24&expansionId=e1");
  });
});

/* ============================================================== G */
describe("G. boundaries, and what did not change", () => {

  test("the catalog is still read-only and still takes no lock", () => {
    const repo = code("persistence/catalog-repository.js");
    for (const method of ["findCardContexts", "findExpansions", "findArtists"]) {
      assert(new RegExp(`async ${method}\\(`).test(repo), `${method} is missing`);
    }
    const app = code("server/app.js");
    for (const route of ["/api/expansions", "/api/artists"]) {
      assert(new RegExp(`app\\.get\\("${route}", \\{ preHandler: authenticate \\}`).test(app),
        `${route} is not an authenticated read`);
    }
    assert(!/lockWorld|loadWorld/.test(repo), "the catalog reached the world");
  });

  /* RESTATED IN C2, WHICH OPENED THREE DOORS ON PURPOSE — the three a Collector
     needs to own a card and to say whether they are offering it. What C1 has to
     keep true is that IT opened none, and that the browse surface still names
     no command at all. The second assertion is the one that carries the weight
     and it is unchanged; the list is restated with C2's additions named, so the
     next batch that edits this line has to say which door it opened and why. */
  /* RESTATED AGAIN IN C3.3, for the reason this test was already restated once
     in C2: the list is written down so that the next batch to edit this line has
     to say which door it opened and why. C3.3 opened five, for the Card
     Specification panel. The assertion that carries the weight is the last one
     and it is untouched — the SHARED BROWSER still names no command, which is
     what keeps a picker used by both seats from being able to write anything. */
  /* RESTATED AGAIN IN C3.4b, for the same reason a third time. C3.4b opened two,
     for the Binder library — the screen that manages a binder as an object, and
     therefore the batch that owes them a control. The assertion that carries the
     weight is still the last one and is still untouched. */
  test("every door is declared, and the shared browser still opens none of them", () => {
    eq(json([...EXPOSED_COMMANDS].sort()), json([
      "addGoal", "addInventoryCopy", "removeGoal",
      "revokeCollectorInvitation", "updateGoalTier", "updatePartnerProfile",
      /* C2, and only these three: owning, offering, no longer owning. */
      "addCollectorCopy", "setCollectorCopyOffered", "removeCollectorCopy",
      /* C3.3, the Card Specification panel's five. */
      "createBinder", "addBinderEntry", "removeBinderEntry",
      "updateCollectorCopy", "updateGoalCriteria",
      /* C3.4b, the Binder library's two: rename one in place, put one away and
         bring it back. Deleting one is still nobody's door. */
      "renameBinder", "setBinderArchived",
    ].sort()), "a door was opened that nobody declared");
    const browserCode = code("client/browse/CardBrowser.jsx");
    assert(!EXPOSED_COMMANDS.some((c) => browserCode.includes(c)),
      "the shared browser names a command");
    /* And the Trusted Partner's use of it still has no fast path, because there
       is still no such thing as a copy whose facts nobody has entered. */
    assert(/fastAdd = true/.test(code("client/browse/CardBrowser.jsx")),
      "the fast path stopped being something a caller chooses");
  });

  test("an unauthenticated caller reaches none of it", async () => {
    const ctx = await world();
    await shelfOfCards(ctx);
    for (const url of ["/api/card-contexts?query=zard", "/api/expansions", "/api/artists"]) {
      const res = await ctx.app.inject({ method: "GET", url });
      eq(res.statusCode, 401, `${url} answered without a token`);
    }
  });

  test("which door was used is recorded; what was typed is not", async () => {
    const ctx = await world();
    await shelfOfCards(ctx);
    await browse(ctx, "casey", "query=SOMETHING-PRIVATE-ISH");
    await browse(ctx, "casey", "pokedex=6");
    await browse(ctx, "north", "artist=Ken%20Sugimori");
    const lines = said(ctx.logger, "browse");
    eq(lines.length, 3, "a browse went unrecorded");
    eq(lines.map((l) => l.fields.doorway).join(","), "name,pokemon,artist");
    eq(lines[2].fields.seat, "tp", "the seat that browsed");
    eq(lines[1].fields.results, 1, "how much came back");
    assert(!json(lines).includes("SOMETHING-PRIVATE-ISH"), "what was typed reached the log");
  });

  test("the migration is indexes and nothing else", () => {
    const sql = read("persistence/migrations/0010_catalog_browse_indexes.sql");
    assert(/create index card_contexts_pokedex_idx/.test(sql), "the pokedex index");
    assert(!/alter table|create table|drop |insert |update |delete /i.test(sql),
      "0010 changed something other than an index");
  });

  test("B5's model, B6's supply, B7's demand and B8's discovery are as they were", async () => {
    const ctx = await world();
    const made = await shelfOfCards(ctx);
    await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: made.charizard.cards[1], tier: "primary", desired: { grade: "PSA 9" } });
    await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: made.charizard.cards[1], ask: 900, cost: 400 } });
    const res = await get(ctx.app, "casey", "/api/view");
    eq(res.json().state.discoveries.length, 1, "supply and demand stopped meeting");
    /* A different printing of the same artwork still does not match. */
    await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: made.charizard.cards[0], tier: "secondary", desired: { grade: "PSA 9" } });
    eq((await get(ctx.app, "casey", "/api/view")).json().state.discoveries.length, 1,
      "a 1st Edition goal matched an Unlimited copy");
    /* And the partner's own figures still do not travel. */
    assert(!res.body.includes("400"), "the partner's cost reached the Collector");
  });
});

run();
