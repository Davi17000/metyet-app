/* ============================================================================
   PHASE 5 C3.4a — YOUR CARDS

   The screen that has been built and unreachable for four batches.

   Batch 8.1 deferred it because it was impossible: the only command that wrote
   a Collector's copy demanded a row in the legacy catalogue, and production's
   is empty by design. C2 gave a copy a canonical card. C3.3 gave a person a way
   to record one. And then the screen itself was still wrong — it looked its
   cards up in that same legacy catalogue by `cardId`, so every production copy
   rendered as "a card that isn't in your catalogue". That was the last reason
   it stayed in `DEFERRED_SECTIONS`, and it is what this batch fixes.

   WHAT IT HAD TO GET RIGHT. A Collector owns PHYSICAL COPIES, and two copies of
   one card are two objects with their own grading, their own certificate, their
   own reference value and their own willingness to part with them. A screen
   that grouped them and showed one grade would be describing neither. So the
   card is a heading and the copies are the records, and the heading carries
   nothing that would have to be averaged.

   A. the name              canonical cards, described once, never the catalogue
   B. the shape             card first, copies second, nothing aggregated
   C. offered               a derived filter, and no Trade Binder anywhere
   D. want and own          two facts about one card, both visible
   E. the panel             the same specification capability, opened from here
   F. the navigation        reachable at last, and what that did not change
   ========================================================================== */

const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const React = require("react");
const TR = require("react-test-renderer");
const esbuild = require("esbuild");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { createApp } = require("../server/app.js");
const { executeCommand } = require("../persistence/command-transaction.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { projectForActor, FIELD_RULES } = require("../domain/metyet-projection.js");
const { validateWorld } = require("../domain/metyet-world.js");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
const C = require("../domain/metyet-commands.js");
const D = require("../domain/metyet-domain.js");
const RT = require("../domain/metyet-runtime.js");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
/* Source with comments stripped, for assertions about what the code DOES
   rather than about what it says it does. */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const json = (v) => JSON.stringify(v);

let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));

const SUBJECT = { north: "sub-north", second: "sub-second", casey: "sub-casey" };
const ACTOR = { casey: { collectorId: "c1" }, north: { partnerId: "p1" }, second: { partnerId: "p2" } };

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
    invitations: [], goals: [], inventory: [], collectorCopies: [],
    binders: [], binderEntries: [],
    interests: [], opportunities: [], conversations: [], photoRequests: [], copyReviews: [],
  });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: SUBJECT.north, role: "tp", partnerId: "p1" });
  await accounts.linkAccount({ subject: SUBJECT.second, role: "tp", partnerId: "p2" });
  await accounts.linkAccount({ subject: SUBJECT.casey, role: "collector", collectorId: "c1" });
  const verifier = { verify: async (token) => {
    const subject = SUBJECT[token];
    if (!subject) throw Object.assign(new Error("no"), { reason: "bad token" });
    return { subject, email: `${token}@example.invalid`, emailVerified: true };
  } };
  return { pg, db, runtime, repository, catalog,
    app: createApp({ repository, catalog, accounts, verifier, runtime }) };
}

/* Two printings of one card plus a second card, so "another printing" and
   "another card" are never confused with "another copy of this one". */
async function cards(ctx) {
  const { expansionId } = await ctx.catalog.putExpansion(
    { game: "pokemon", code: "base1", name: "Base", printedTotal: 102 });
  const charizard = await ctx.catalog.putCardContext({ game: "pokemon", expansionId,
    collectorNumber: "4", cardName: "Charizard", artist: "Mitsuhiro Arita" });
  const mudkip = await ctx.catalog.putCardContext({ game: "pokemon", expansionId,
    collectorNumber: "63", cardName: "Mudkip", artist: "Kagemaru Himeno" });
  const made = { charizardContext: charizard.cardContextId, mudkipContext: mudkip.cardContextId };
  made.firstEdition = (await ctx.catalog.putCanonicalCard({ cardContextId: charizard.cardContextId,
    printRun: "first_edition", finish: "holofoil" })).canonicalCardId;
  made.unlimited = (await ctx.catalog.putCanonicalCard({ cardContextId: charizard.cardContextId,
    printRun: "unlimited", finish: "holofoil" })).canonicalCardId;
  made.mudkip = (await ctx.catalog.putCanonicalCard({ cardContextId: mudkip.cardContextId,
    printRun: "unlimited", finish: "non_holo",
    /* A picture, so "the catalogue's image is shown" is testable at all. */
    imageSmall: "https://img.example.invalid/mudkip-small.png",
    imageLarge: "https://img.example.invalid/mudkip-large.png" })).canonicalCardId;
  return made;
}

const post = (app, token, command, payload) => app.inject({ method: "POST", url: "/api/commands",
  headers: { authorization: `Bearer ${token}` }, payload: { command, payload } });
const get = (app, token, url) => app.inject({ method: "GET", url,
  headers: { authorization: `Bearer ${token}` } });
const view = async (app, token) => (await get(app, token, "/api/view")).json().state;
const own = (app, token, copy) => post(app, token, "addCollectorCopy", { copy });
const stock = (app, token, copy) => post(app, token, "addInventoryCopy", { copy });
const want = (app, token, canonicalCardId, tier = "primary", extra = {}) =>
  post(app, token, "addGoal", { canonicalCardId, tier, ...extra });
const load = (ctx) => ctx.repository.loadWorld();
const refusal = (res) => (res.statusCode === 200 ? null : res.json().error.refused);
/* Past the production door, for domain rules whose surface is not the subject. */
const direct = (ctx, actor, command, payload) =>
  executeCommand(ctx.repository, { actor, command, payload, runtime: ctx.runtime });

/* ---------------------------------------------------------------- RENDERING
   The same approach C1 established: build the real component with esbuild and
   drive it with react-test-renderer against a real server. No DOM, so nothing
   below claims anything about pixels — see section E on what "the grid stayed
   put" is allowed to mean here. */
const build = (rel) => {
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
const selects = (r) => r.root.findAll((n) => n.type === "select");
/* A click starts real work — a catalog read, a command — and `act` only awaits
   its own callback, not a promise an onClick handler drops. */
const settle = async () => {
  for (let i = 0; i < 5; i += 1) {
    await TR.act(async () => { await new Promise((done) => setTimeout(done, 0)); });
  }
};
const findButton = (r, label) => buttons(r).find((n) => instText(n).trim() === label
  || instText(n).includes(label) || (n.props["aria-label"] || "") === label);
const press = async (r, label) => {
  const b = findButton(r, label);
  assert(b, `no button "${label}" among: ${buttons(r).map(instText).join(" | ")}`);
  assert(!b.props.disabled, `the button "${label}" is disabled`);
  await TR.act(async () => { b.props.onClick(); });
  await settle();
};
const typeInto = async (r, id, value) => {
  const input = r.root.findAll((n) => n.type === "input").find((n) => n.props.id === id);
  assert(input, `no input ${id}`);
  await TR.act(async () => { input.props.onChange({ target: { value } }); });
  await settle();
};
/* A <select> found by the label text of the <label> that wraps it. */
const selectNamed = (r, label) => {
  const wrapper = r.root.findAll((n) => n.type === "label")
    .find((n) => instText(n).includes(label));
  if (!wrapper) return null;
  return wrapper.findAll((n) => n.type === "select")[0] || null;
};
const choose = async (r, label, value) => {
  const el = selectNamed(r, label);
  assert(el, `no control "${label}"`);
  await TR.act(async () => { el.props.onChange({ target: { value } }); });
  await settle();
};
const optionsOf = (el) => el.findAll((n) => n.type === "option").map((n) => n.props.value);

/* A browse door wired to the real catalog repository, counting its calls so a
   test can prove the grid was not re-fetched. */
const doorFor = (ctx) => {
  const calls = { find: 0, read: 0, describe: 0 };
  return { calls, door: {
    find: async (query) => {
      calls.find += 1;
      return ctx.catalog.findCardContexts(Object.fromEntries(new URLSearchParams(query).entries()));
    },
    read: async (id) => {
      calls.read += 1;
      const found = await ctx.catalog.readCardContext(id);
      return found ? { ...found.context, canonicalCards: found.canonicalCards } : null;
    },
    describe: async (ids) => { calls.describe += 1; return { cards: await ctx.catalog.describeCanonicalCards(ids) }; },
    expansions: async (q) => ctx.catalog.findExpansions(Object.fromEntries(new URLSearchParams(q).entries())),
    artists: async (q) => ctx.catalog.findArtists(Object.fromEntries(new URLSearchParams(q).entries())),
  } };
};


/* ============================================================== A */
describe("A. a card you own is called what the catalog calls it", () => {

  const SHELL = build("client/collector/CollectorShell.jsx").default;

  const showing = async (ctx, extra = {}) => {
    const state = await view(ctx.app, "casey");
    const { door, calls } = doorFor(ctx);
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(SHELL,
        { state, onSignOut() {}, onBrowseCards: door, ...extra }));
    });
    await press(r, "Your Cards");
    return { r, calls, state };
  };

  test("a canonical copy shows its real name, set, number and picture", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await own(ctx.app, "casey", { canonicalCardId: made.mudkip, grade: "PSA 9", cert: "PSA 1" });
    const { r } = await showing(ctx);
    const shown = texts(r);
    assert(/Mudkip/.test(shown), "the card's name: " + shown);
    assert(/Base/.test(shown), "the set: " + shown);
    assert(/#63/.test(shown), "the collector number: " + shown);
    /* THE DEBT THIS BATCH EXISTS TO PAY. */
    assert(!/isn.t in your catalogue/.test(shown),
      "a canonical copy still reads as a card the catalogue does not have: " + shown);
    /* The catalogue's picture of the card — not a photograph of this copy. */
    const images = r.root.findAll((n) => n.type === "img");
    assert(images.length >= 1, "the card has no picture");
    assert(!/binder:/.test(json(images.map((i) => i.props.src))),
      "a Collector's own photo reference was rendered as an image");
  });

  test("the catalog is asked once, for the ids on screen, and never per row", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    for (const card of [made.mudkip, made.firstEdition, made.unlimited]) {
      await own(ctx.app, "casey", { canonicalCardId: card, grade: "PSA 9" });
    }
    await own(ctx.app, "casey", { canonicalCardId: made.mudkip, grade: "Raw", condition: "Damaged" });
    const { calls } = await showing(ctx);
    eq(calls.describe, 1, "the catalog was asked more than once for one screen");
    eq(calls.find, 0, "the shelf ran a card search of its own");
  });

  test("a card whose description has not arrived is still a card you own", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await own(ctx.app, "casey", { canonicalCardId: made.mudkip, grade: "PSA 9", cert: "PSA 77" });
    const state = await view(ctx.app, "casey");
    let r;
    /* A door whose describe never answers. */
    await TR.act(async () => {
      r = TR.create(React.createElement(SHELL, { state, onSignOut() {},
        onBrowseCards: { describe: async () => { throw new Error("no"); },
          find: async () => ({ contexts: [], total: 0 }), read: async () => null,
          expansions: async () => ({ expansions: [] }), artists: async () => ({ artists: [] }) } }));
    });
    await press(r, "Your Cards");
    const shown = texts(r);
    assert(/PSA 77/.test(shown), "the copy vanished with its caption: " + shown);
    assert(/PSA 9/.test(shown), "the copy's own grading vanished too: " + shown);
  });
});

/* ============================================================== B */
describe("B. the card is a heading; the copies are the records", () => {

  const SHELL = build("client/collector/CollectorShell.jsx").default;
  const showing = async (ctx) => {
    const state = await view(ctx.app, "casey");
    const { door } = doorFor(ctx);
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(SHELL, { state, onSignOut() {}, onBrowseCards: door }));
    });
    await press(r, "Your Cards");
    return r;
  };

  test("no copies is an honest empty shelf", async () => {
    const ctx = await world();
    await cards(ctx);
    const r = await showing(ctx);
    const shown = texts(r);
    assert(/haven't recorded any cards yet/.test(shown), shown);
    assert(!/Offered only/.test(shown), "a filter was offered for an empty shelf");
  });

  test("one card, two copies: one heading, two records, each on its own terms", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const a = (await own(ctx.app, "casey", { canonicalCardId: made.mudkip,
      grade: "PSA 9", cert: "CERT-A", market: 500, offered: true })).json().value;
    const b = (await own(ctx.app, "casey", { canonicalCardId: made.mudkip,
      grade: "Raw", condition: "Damaged", cert: "SER-B", market: 20 })).json().value;
    assert(a !== b, "two copies became one record");

    const r = await showing(ctx);
    const shown = texts(r);
    /* One heading for the card. */
    eq((shown.match(/Mudkip/g) || []).length, 1, "the card was named once per copy: " + shown);
    assert(/2 copies/.test(shown), "the heading does not say how many: " + shown);
    /* Two records, each with its own everything. */
    assert(/PSA 9/.test(shown) && /Raw · Damaged/.test(shown), "both gradings: " + shown);
    assert(/CERT-A/.test(shown) && /SER-B/.test(shown), "both certificates: " + shown);
    assert(/\$500/.test(shown) && /\$20/.test(shown), "both reference values: " + shown);
    assert(/Offered/.test(shown) && /Not offered/.test(shown), "offering is per copy: " + shown);
  });

  /* THE RULE THIS SECTION EXISTS FOR. A group of a PSA 9 and a damaged raw copy
     has no single grading, and inventing one would describe neither card. */
  test("the heading never carries a grade", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await own(ctx.app, "casey", { canonicalCardId: made.mudkip, grade: "PSA 9" });
    await own(ctx.app, "casey", { canonicalCardId: made.mudkip, grade: "Raw", condition: "Damaged" });
    const r = await showing(ctx);
    /* The heading is the element that carries the card's name; find it and
       assert what it does NOT say. */
    const heads = r.root.findAll((n) => n.props && n.props.className === "mcs-group-head");
    eq(heads.length, 1);
    const head = instText(heads[0]);
    assert(/Mudkip/.test(head), "the heading does not name the card: " + head);
    assert(!/PSA|Raw|Damaged/.test(head), "the heading carries a grading: " + head);
    /* And it does not source grading from the catalogue either. */
    assert(!/gradeLine\(known\)|gradeLine\(legacy\)|isGraded\(known\)/
      .test(code("client/collector/sections/MyCards.jsx")),
    "the shelf reads a copy's grading from a card description");
  });

  test("a contradictory historical copy still reads honestly", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    const before = await load(ctx);
    await ctx.repository.saveWorld({ ...before, collectorCopies: [{ id: "b-old",
      collectorId: "c1", canonicalCardId: made.mudkip, grade: "PSA 9", condition: "Damaged",
      offered: false, addedAt: "2030-01-01T00:00:00.000Z" }] });
    const shown = texts(await showing(ctx));
    assert(/Says PSA 9 and Damaged/.test(shown),
      "a copy that disagrees with itself was shown as a clean grade: " + shown);
  });
});

/* ============================================================== C */
describe("C. what you are offering is a filter, not a place", () => {

  const SHELL = build("client/collector/CollectorShell.jsx").default;
  const showing = async (ctx) => {
    const state = await view(ctx.app, "casey");
    const { door } = doorFor(ctx);
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(SHELL, { state, onSignOut() {}, onBrowseCards: door }));
    });
    await press(r, "Your Cards");
    return r;
  };

  test("it hides the copies you are not offering, and only those", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await own(ctx.app, "casey", { canonicalCardId: made.mudkip, grade: "PSA 9", cert: "YES-1", offered: true });
    await own(ctx.app, "casey", { canonicalCardId: made.mudkip, grade: "Raw", condition: "Damaged", cert: "NO-1" });
    await own(ctx.app, "casey", { canonicalCardId: made.firstEdition, grade: "PSA 8", cert: "NO-2" });

    const r = await showing(ctx);
    assert(/YES-1/.test(texts(r)) && /NO-1/.test(texts(r)) && /NO-2/.test(texts(r)), "all three show first");
    await press(r, "Offered only");
    const filtered = texts(r);
    assert(/YES-1/.test(filtered), "the offered copy went missing: " + filtered);
    assert(!/NO-1/.test(filtered), "an unoffered copy of the same card survived the filter");
    assert(!/NO-2/.test(filtered), "an unoffered copy of another card survived the filter");
    assert(!/Charizard/.test(filtered), "a card with nothing offered kept its heading");
    /* And it is a filter: pressing it again brings them back. */
    await press(r, "Offered only");
    assert(/NO-1/.test(texts(r)), "the filter was not reversible");
  });

  test("it writes nothing, and no Trade Binder exists anywhere", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await own(ctx.app, "casey", { canonicalCardId: made.mudkip, grade: "PSA 9", offered: true });
    const before = json(await load(ctx));
    const r = await showing(ctx);
    await press(r, "Offered only");
    eq(json(await load(ctx)), before, "filtering wrote something");
    const w = await load(ctx);
    assert(!("tradeBinders" in w) && !("tradeBinder" in w), "a Trade Binder was persisted");
    /* Nor is one a Binder: a Collector who has offered a card has no binder. */
    eq(w.binders.length, 0, "offering a card created a binder");
  });
});

/* ============================================================== D */
describe("D. wanting a card you own is ordinary, and both are shown", () => {

  const SHELL = build("client/collector/CollectorShell.jsx").default;

  test("a Goal and a copy of one card coexist, and the shelf says so", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.mudkip, "primary", { desired: { grade: "PSA 10" } });
    await own(ctx.app, "casey", { canonicalCardId: made.mudkip, grade: "PSA 8", cert: "HAVE-1" });
    const state = await view(ctx.app, "casey");
    const { door } = doorFor(ctx);
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(SHELL, { state, onSignOut() {}, onBrowseCards: door }));
    });
    await press(r, "Your Cards");
    const shown = texts(r);
    assert(/HAVE-1/.test(shown), "the copy: " + shown);
    assert(/Actively hunting/.test(shown),
      "owning one hid the fact that a better one is still wanted: " + shown);
    /* The desired grade is the GOAL's, and is not shown as the copy's. */
    const heads = r.root.findAll((n) => n.props && n.props.className === "mcs-group-head");
    assert(!/PSA 10/.test(instText(heads[0])), "the wanted grade was shown as a fact about a copy");
  });
});

/* ============================================================== E */
describe("E. the same specification capability, opened from the shelf", () => {

  const SHELL = build("client/collector/CollectorShell.jsx").default;

  const shelf = async (ctx, onSpecify) => {
    const state = await view(ctx.app, "casey");
    const { door } = doorFor(ctx);
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(SHELL,
        { state, onSignOut() {}, onBrowseCards: door, onSpecify }));
    });
    await press(r, "Your Cards");
    return r;
  };

  test("Open shows the card's current truth, and Cancel writes nothing", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await want(ctx.app, "casey", made.mudkip, "secondary", { desired: { grade: "PSA 9" } });
    await own(ctx.app, "casey", { canonicalCardId: made.mudkip, grade: "PSA 9", cert: "C-1", offered: true });
    const before = json(await load(ctx));
    const sent = [];
    const r = await shelf(ctx, async (step) => { sent.push(step); return { ok: true }; });

    await press(r, "Open");
    const shown = texts(r);
    assert(/Which binders does this card belong in\?/.test(shown), "the panel did not open: " + shown);
    assert(/Are you looking for it\?/.test(shown), "the panel is a different one: " + shown);
    /* It opened on what the Collector already said. */
    const keeping = buttons(r).find((b) => instText(b).trim() === "Keeping an eye out");
    eq(keeping.props["aria-pressed"], true, "the panel did not open on the current tier");

    await press(r, "Cancel");
    eq(sent.length, 0, "opening or closing the panel sent a command");
    eq(json(await load(ctx)), before, "opening or closing the panel wrote something");
  });

  test("it is the one panel, handed the one callback — no second save grammar", () => {
    const shelfCode = code("client/collector/sections/MyCards.jsx");
    assert(/CardSpecification/.test(shelfCode), "the shelf does not use the shared panel");
    /* A Collector surface may not name a command: it calls what it was handed. */
    for (const name of EXPOSED_COMMANDS) {
      assert(!new RegExp(`["']${name}["']`).test(shelfCode),
        `the shelf names the command ${name}`);
    }
    assert(!/execute\s*\(|\.command\s*\(/.test(shelfCode), "the shelf has a way to write");
    /* And it does not re-interpret the panel's steps. */
    assert(!/case "make-binder"|case "record-copy"|planFrom/.test(shelfCode),
      "the shelf re-implements the commit sequence");
  });

  test("a legacy copy cannot be specified, because it names no canonical card", async () => {
    const ctx = await world();
    const before = await load(ctx);
    await ctx.repository.saveWorld({ ...before,
      catalog: [{ id: "k1", name: "Legacy One", set: "Demo", num: "1/1" }],
      collectorCopies: [{ id: "b-legacy", collectorId: "c1", cardId: "k1",
        grade: "PSA 9", offered: false, addedAt: "2030-01-01T00:00:00.000Z" }] });
    const r = await shelf(ctx, async () => ({ ok: true }));
    const shown = texts(r);
    assert(/Legacy One/.test(shown), "the demo copy did not render: " + shown);
    assert(!buttons(r).some((b) => instText(b).trim() === "Open"),
      "a copy with no canonical card offered to specify one");
  });
});

/* ============================================================== F */
describe("F. reachable at last, and what that did not change", () => {

  const SHELL_MOD = build("client/collector/CollectorShell.jsx");

  /* SUPERSEDED AND RESTATED BY C3.4b, the second half of this same batch.

     What it protected: that Your Cards reached the navigation and that nothing
     was left waiting behind a deferred flag once it did.

     Why it is no longer correct: C3.4b replaced the top-level Goals entry with
     Binder, because a Binder expresses coherence and a Goal expresses priority,
     and priority belongs inside the card experiences rather than beside them.
     Goals.jsx was not deleted — it moved into DEFERRED_SECTIONS, so the view
     still renders where composed experiences reach it.

     What replaces it, and why it is stricter: the navigation is pinned to the
     exact four production sections in order, Your Cards keeps every claim it
     had, and DEFERRED_SECTIONS is pinned by name rather than only by length —
     so a section cannot be quietly parked there. */
  test("Your Cards is in the navigation, and only Goals waits behind it", () => {
    eq(SHELL_MOD.SECTIONS.map((s) => s.id).join(","), "browse,binder,my-cards,partners");
    eq(SHELL_MOD.DEFERRED_SECTIONS.map((s) => s.id).join(","), "goals",
      "something else is deferred");
    const mine = SHELL_MOD.SECTIONS.find((s) => s.id === "my-cards");
    eq(mine.label, "Your Cards");
    eq(mine.count, "collectorCopies", "it counts something other than its own collection");
  });

  /* SUPERSEDED AND RESTATED BY C3.4b. C3.4a's claim was that IT opened no door
     — still true of C3.4a, and now asserted against C3.4a's own commit rather
     than against the allow-list forever. C3.4b opened the two binder-lifecycle
     doors deliberately, in the half of the batch that built the screen. The
     restatement is stricter: it holds the recovery seam itself to its promise,
     which a live reading of EXPOSED_COMMANDS could never do once C3.4b landed. */
  test("C3.4a opened no door and added no command", () => {
    const { execFileSync } = require("child_process");
    const at = execFileSync("git", ["show", "00dee91:server/exposed-commands.js"],
      { cwd: ROOT, encoding: "utf8" });
    /* Only the list literal: everything after `]);` is ordinary code, and a
       `typeof x === "string"` would otherwise count as a command. */
    const after = at.split("EXPOSED_COMMANDS")[1] || "";
    const names = after.slice(0, after.indexOf("]);")).match(/"[a-zA-Z]+"/g) || [];
    eq(names.length, 14, "C3.4a changed the production surface");
    assert(!names.includes('"renameBinder"'), "a binder door opened in the Your Cards batch");
    assert(!names.includes('"setBinderArchived"'));
    assert(!C.COMMAND_NAMES.includes("saveCardSpecification"), "an aggregate command appeared");
  });

  test("opening the shelf writes nothing and creates no discovery", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await own(ctx.app, "casey", { canonicalCardId: made.mudkip, grade: "PSA 9", offered: true });
    await stock(ctx.app, "north", { canonicalCardId: made.mudkip, grade: "PSA 9", ask: 900 });
    const before = json(await load(ctx));
    const state = await view(ctx.app, "casey");
    const { door } = doorFor(ctx);
    let r;
    await TR.act(async () => {
      r = TR.create(React.createElement(SHELL_MOD.default,
        { state, onSignOut() {}, onBrowseCards: door }));
    });
    await press(r, "Your Cards");
    eq(json(await load(ctx)), before, "looking at your own cards wrote something");
    /* No Goal, so no overlap — looking at a card you own is not wanting it. */
    eq((await view(ctx.app, "casey")).discoveries.length, 0);
  });

  test("and a partner still receives only what they always did", async () => {
    const ctx = await world();
    const made = await cards(ctx);
    await own(ctx.app, "casey", { canonicalCardId: made.mudkip, grade: "PSA 9",
      offered: true, market: 7777, note: "do not sell under 9k" });
    await own(ctx.app, "casey", { canonicalCardId: made.firstEdition, grade: "PSA 8" });
    const body = (await get(ctx.app, "north", "/api/view")).body;
    assert(!body.includes("7777"), "the reference value crossed");
    assert(!body.includes("do not sell"), "a private note crossed");
    const seen = JSON.parse(body).state.collectorCopies;
    eq(seen.length, 1, "an unoffered copy reached a partner");
    eq(seen[0].grading.label, "PSA 9");
  });

  test("no migration, and no new durable concept", async () => {
    const names = fs.readdirSync(path.join(ROOT, "persistence", "migrations")).sort();
    eq(names[names.length - 1], "0013_binders.sql", "C3.4a added a migration: " + names.join(","));
    const { PROJECTED_COLLECTIONS } = require("../domain/metyet-projection.js");
    assert(!PROJECTED_COLLECTIONS.some((c) => /trade|offered|shelf/i.test(c)),
      "a new collection appeared: " + PROJECTED_COLLECTIONS.join(","));
  });
});

run();
