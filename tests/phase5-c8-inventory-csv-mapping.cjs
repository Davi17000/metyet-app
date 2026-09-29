/* ============================================================================
   PHASE 5 C8 — A SHOP'S OWN INVENTORY FILE

   The claim: MetYet can take a differently-shaped Trusted Partner inventory CSV,
   map its columns into one provider-neutral contract, tell the founder which
   rows resolve against the catalog MetYet actually has, and import only the
   approved resolvable ones through the inventory model that already exists.

   WHAT THESE TESTS ARE MOSTLY ABOUT. Not the happy path — that is four tests.
   The rest are about the ways a convenient input boundary could quietly weaken
   canonical identity: a blank that becomes a default, a word nobody taught us
   that becomes the nearest guess, two candidate printings where one gets picked,
   a price in words that becomes zero, a preview that writes, a partner named by
   the file rather than by the caller. Each of those is a test that fails if the
   implementation gets generous in the wrong direction.

   THE SHAPE OF THE SUITE
     A. the file            — CSV reading, headers, quoting, formulas as data
     B. the template        — configuration that cannot outvote the domain
     C. normalising a row    — what a row says, and what it cannot be made to say
     D. resolving a card     — the hard boundary: one, none, or too many
     E. previewing           — classification, reasons, and no writes
     F. importing            — the existing command, one transaction, quantity
     G. authorisation        — whose shelf this is
     H. no provider, no network
     I. and the rest of MetYet is untouched
   ========================================================================= */

const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { createApp } = require("../server/app.js");
const RT = require("../domain/metyet-runtime.js");
const CI = require("../domain/card-identity.js");
const D = require("../domain/metyet-domain.js");

const MAP = require("../server/inventory/mapping.js");
const { parseCsv, createMapper, checkTemplate, INVALID } = MAP;
const TPL = require("../server/inventory/templates.js");
const { resolveIdentity, OUTCOME, REASON } = require("../server/inventory/resolve.js");
const { plan, apply, CLASS } = require("../server/inventory/import.js");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const json = (v) => JSON.stringify(v);

const FIXTURE = "tests/fixtures/collectr-provisional.csv";

/* ------------------------------------------------------------------ the world */
let pglite = null;
const database = () => (pglite || (pglite = new PGlite()));
const SUBJECT = { north: "sub-north", second: "sub-second", casey: "sub-casey" };

async function world() {
  const pg = database();
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade; drop schema if exists metyet_catalog cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  const runtime = RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 1000 });
  const repository = createWorldRepository(db);
  const catalog = createCatalogRepository(db, { newId: runtime.newId });
  await repository.saveWorld({
    catalog: [], collectors: [{ id: "c1", name: "Casey" }],
    partners: [{ id: "p1", name: "Northline" }, { id: "p2", name: "Second" }],
    relationships: [{ partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" }],
    invitations: [], goals: [], inventory: [], collectorCopies: [], binders: [],
    binderEntries: [], interests: [], opportunities: [], conversations: [],
    photoRequests: [], copyReviews: [],
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
  const app = createApp({ repository, catalog, accounts, verifier, runtime });
  return { pg, db, runtime, repository, catalog, app };
}

/* A catalog with exactly the cards the fixture's good rows are about, so an
   unresolved row in a test is unresolved for the reason the test says. */
async function stockCatalog(ctx) {
  const { expansionId } = await ctx.catalog.putExpansion(
    { game: "pokemon", code: "BASE1", name: "Base Set", printedTotal: 102 });
  const made = {};
  const context = async (number, name, extra = {}) => {
    const { cardContextId } = await ctx.catalog.putCardContext({ game: "pokemon", expansionId,
      collectorNumber: number, cardName: name, ...extra });
    return cardContextId;
  };
  const card = async (cardContextId, dimensions) =>
    (await ctx.catalog.putCanonicalCard({ cardContextId, ...CI.withDefaults(dimensions) })).canonicalCardId;

  /* Charizard #4 has THREE printings, so a row that names none of them is
     genuinely ambiguous and a row that names one is not. */
  const zard = await context("4", "Charizard");
  made.zardUnlimited = await card(zard, { printRun: "unlimited", finish: "holofoil" });
  made.zardShadowless = await card(zard, { printRun: "shadowless", finish: "holofoil" });
  made.zardFirst = await card(zard, { printRun: "first_edition", finish: "holofoil" });

  /* One printing each, so silence about a printing is not ambiguous. */
  const blast = await context("2", "Blastoise");
  made.blastoise = await card(blast, { printRun: "unlimited", finish: "holofoil" });
  const alakazam = await context("1", "Alakazam");
  made.alakazam = await card(alakazam, { printRun: "first_edition", finish: "holofoil" });
  const machamp = await context("8", "Machamp");
  made.machamp = await card(machamp, { printRun: "shadowless", finish: "holofoil" });
  const mudkip = await context("63", "Mudkip");
  made.mudkip = await card(mudkip, { printRun: "unlimited", finish: "non_holo" });
  const farfetchd = await context("27", "Farfetch'd, Lost");
  made.farfetchd = await card(farfetchd, { printRun: "unlimited", finish: "non_holo" });
  /* Pikachu #58 exists but only in a printing the fixture does not name. */
  const pika = await context("58", "Pikachu");
  made.pikachuFirst = await card(pika, { printRun: "first_edition", finish: "non_holo" });
  made.expansionId = expansionId;
  made.zardContext = zard;
  return made;
}

const mapper = (name = "collectr-provisional") =>
  createMapper({ template: TPL.readTemplate(name) });

const fixture = () => read(FIXTURE);
const rowsOf = (csv) => parseCsv(csv);
const normalizeOne = (m, csv, line) => {
  const { headers, rows } = rowsOf(csv);
  return m.normalize(rows[line - 2], headers, { at: line });
};
/* A one-row CSV built from the fixture's header, so a test changes one cell and
   nothing else. */
const oneRow = (edits = {}) => {
  const { headers, rows } = rowsOf(fixture());
  const row = rows[0].slice();
  for (const [header, value] of Object.entries(edits)) {
    const at = headers.findIndex((h) => MAP.foldHeader(h) === MAP.foldHeader(header));
    assert(at >= 0, "no such header in the fixture: " + header);
    row[at] = value;
  }
  const quote = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return `${headers.map(quote).join(",")}\n${row.map(quote).join(",")}\n`;
};

const { runCommand } = require("../server/cli.js");
const os = require("os");

/* The CLI, with its database injected and its output captured — the same shape
   C4 uses, because the operator surface is the only surface this batch has and
   an untested CLI is an untested batch. */
async function cli(argv, ctx) {
  const lines = [];
  const exit = await runCommand(argv, {
    say: (line) => lines.push(String(line)),
    database: ctx ? { db: ctx.db, repository: ctx.repository } : undefined,
    env: {},
  });
  return { exit, out: lines.join("\n") };
}
/* A CSV on disk, because the verbs read paths. Written under the OS temp dir and
   never inside the repository. */
let scratch = null;
const csvFile = (text, name = "in.csv") => {
  if (!scratch) scratch = fs.mkdtempSync(path.join(os.tmpdir(), "metyet-c8-"));
  const at = path.join(scratch, name);
  fs.writeFileSync(at, text);
  return at;
};

const post = (app, token, command, payload) => app.inject({ method: "POST", url: "/api/commands",
  headers: { authorization: `Bearer ${token}` }, payload: { command, payload } });
const shelf = async (ctx, partnerId = "p1") =>
  (await ctx.repository.loadWorld()).inventory.filter((i) => i.partnerId === partnerId);

/* ================================================================= A. THE FILE */
describe("A. the file is read as a file, and a cell is only ever data", () => {

  test("headers, rows and the ignored columns of the provisional fixture", () => {
    const { headers, rows } = rowsOf(fixture());
    eq(headers.length, 19, json(headers));
    eq(rows.length, 22, "the fixture's row count moved");
    const columns = mapper().columnsFor(headers);
    eq(columns.mapped.length, 15, json(columns.mapped.map((m) => m.field)));
    eq(json(columns.ignored.slice().sort()),
      json(["Image URL", "Last Updated", "Market Value", "Notes"]), json(columns.ignored));
    eq(json(columns.unread), json([]), "a header nothing reads: " + json(columns.unread));
    eq(json(columns.duplicated), json([]), "a duplicated header: " + json(columns.duplicated));
    eq(json(columns.missing), json([]), "a declared header the file lacks");
  });

  test("a quoted field keeps its commas, quotes and apostrophes", () => {
    const { rows } = rowsOf('a,b\n"Farfetch\'d, Lost","say ""hi"", then go"\n');
    eq(json(rows[0]), json(["Farfetch'd, Lost", 'say "hi", then go']));
  });

  test("a newline inside quotes is part of the cell, not a new row", () => {
    const { rows } = rowsOf('a,b\n"two\nlines",x\n');
    eq(rows.length, 1, "the quoted newline split the row");
    eq(rows[0][0], "two\nlines");
  });

  test("CRLF, a byte-order mark and blank lines are read the way a person means them", () => {
    const { headers, rows } = rowsOf("﻿a,b\r\n1,2\r\n\r\n,\r\n3,4\r\n");
    eq(json(headers), json(["a", "b"]), "the BOM stayed on the first header");
    eq(json(rows), json([["1", "2"], ["3", "4"]]), "a blank line became a row");
  });

  test("a row with fewer cells than the header reads the rest as unstated", () => {
    const { headers, rows } = rowsOf("a,b,c\n1\n");
    eq(headers.length, 3);
    eq(rows[0].length, 1, "the short row was padded, hiding what the file did not say");
  });

  test("no cell is ever evaluated, anywhere", () => {
    /* The whole implementation, not just the mapper: a spreadsheet formula is a
       statement about a spreadsheet and MetYet has no business running one. */
    for (const rel of ["server/inventory/mapping.js", "server/inventory/resolve.js",
      "server/inventory/import.js", "server/inventory/templates.js"]) {
      const body = code(rel);
      assert(!/\beval\b|new Function|vm\.|child_process|execSync/.test(body),
        `${rel} can execute something`);
      assert(!/require\([^"']/.test(body), `${rel} requires something it was handed`);
    }
  });

  test("a formula where a fact belongs is refused, not parsed for a value behind it", () => {
    for (const [header, field] of [["Card Name", "cardName"], ["Card Number", "collectorNumber"],
      ["Set Code", "expansion"], ["Listed Price", "ask"], ["Condition", "condition"],
      ["Quantity", "quantity"], ["Foil", "finish"], ["Cert Number", "cert"]]) {
      const out = normalizeOne(mapper(), oneRow({ [header]: "=1+1", Grader: "", Grade: "",
        Condition: header === "Condition" ? "=1+1" : "NM" }), 2);
      assert(!out.ok, `a formula in ${field} was accepted`);
      eq(out.invalid.reason, INVALID.formula, `${field}: ${json(out.invalid)}`);
    }
  });

  test("a leading minus is a negative number, not a formula", () => {
    /* `-5` is a spreadsheet's way of writing minus five and `-SUM(...)` is not.
       Conflating them would refuse an ordinary number for the wrong reason. */
    const out = normalizeOne(mapper(), oneRow({ "Listed Price": "-5" }), 2);
    assert(!out.ok, "a negative price was accepted");
    eq(out.invalid.reason, INVALID.badNumber, json(out.invalid));
  });
});

/* ============================================================= B. THE TEMPLATE */
describe("B. a template is configuration, and cannot outvote the domain", () => {

  test("both shipped templates are valid, and the Collectr one says it is provisional", () => {
    for (const name of TPL.templateNames()) {
      assert(checkTemplate(TPL.readTemplate(name)), name + " is not a valid template");
    }
    const collectr = TPL.readTemplate("collectr-provisional");
    eq(collectr.provisional, true, "the Collectr template does not declare itself provisional");
    assert(/not Collectr's schema/i.test(collectr.note), "its note does not disclaim: " + collectr.note);
    eq(mapper().template.provisional, true, "the mapper does not carry the disclaimer");
  });

  test("a template cannot invent a printing MetYet has no word for", () => {
    for (const [field, word] of [["printRun", "fifth_print"], ["finish", "rainbow_holofoil"],
      ["stamp", "championship"], ["language", "klingon"]]) {
      let threw = false;
      try {
        createMapper({ template: { name: "bad", columns: { cardName: "Card" },
          vocabulary: { [field]: { "whatever": word } } } });
      } catch (error) { threw = true; }
      assert(threw, `a template taught MetYet "${word}" for ${field}`);
    }
  });

  test("a template cannot invent a grade or a condition MetYet cannot hold", () => {
    for (const [field, word] of [["grade", "BGS 9.5"], ["grade", "PSA 9.5"],
      ["grade", "CGC 10"], ["condition", "Pristine"]]) {
      let threw = false;
      try {
        createMapper({ template: { name: "bad", columns: { cardName: "Card" },
          vocabulary: { [field]: { "whatever": word } } } });
      } catch (error) { threw = true; }
      assert(threw, `a template taught MetYet "${word}" for ${field}`);
    }
  });

  test("a typo in a template is a startup error, not a wrong copy later", () => {
    const bad = [
      { name: "x", columns: { notAField: "Card" } },
      { name: "x", columns: { cardName: "Card", expansion: "Card" } },
      { name: "x", columns: { cardName: "Card" }, ignore: ["Card"] },
      { name: "x", columns: { cardName: "" } },
      { columns: { cardName: "Card" } },
      { name: "x" },
      { name: "x", columns: { cardName: "Card" }, vocabulary: { quantity: { a: "b" } } },
    ];
    for (const template of bad) {
      let threw = false;
      try { createMapper({ template }); } catch (error) { threw = true; }
      assert(threw, "a broken template was accepted: " + json(template));
    }
  });

  test("a declared-absent column is a statement; an unmapped one is a question", () => {
    const columns = mapper().columnsFor(["Card Name", "Set Code", "Card Number", "Surprise"]);
    eq(json(columns.unread), json(["Surprise"]), "an unknown header was tolerated");
    /* `stamp: null` in the template means "this source has no stamp column", so
       it is never reported missing. The mapped columns the file lacks are. */
    assert(!columns.missing.some((m) => m.field === "stamp"), "a declared-absent field is missing");
    assert(columns.missing.some((m) => m.field === "quantity"), "a mapped-but-absent field is silent");
  });

  test("templates are configuration: no table, no migration, no domain object", () => {
    const body = code("server/inventory/templates.js");
    assert(!/create table|insert into|select |db\.|repository/i.test(body),
      "the template module reaches persistence");
    const migrations = fs.readdirSync(path.join(ROOT, "persistence", "migrations")).sort();
    eq(migrations[migrations.length - 1], "0013_binders.sql", "C8 added a migration: " + migrations.join(","));
  });
});

/* ======================================================== C. NORMALISING A ROW */
describe("C. what a row says, and what it cannot be made to say", () => {

  test("alternate source headers reach the same MetYet field", () => {
    /* The point of the whole batch: two shops, two spellings, one contract. */
    const custom = createMapper({ template: { name: "other",
      columns: { cardName: "product_name", expansion: "SET  CODE", collectorNumber: "No." },
      vocabulary: {} } });
    const out = custom.normalize(["Charizard", "BASE1", "4"],
      ["Product Name", "set code", "no"], { at: 2 });
    assert(out.ok, json(out.invalid));
    eq(out.record.identity.cardName, "Charizard");
    eq(out.record.identity.expansion, "BASE1");
    eq(out.record.identity.collectorNumber, "4");
  });

  test("header folding joins spacing, case and separators — and never letters", () => {
    eq(MAP.foldHeader(" Card_Name "), MAP.foldHeader("card name"));
    eq(MAP.foldHeader("Set-Code"), MAP.foldHeader("set code"));
    assert(MAP.foldHeader("cardname") !== MAP.foldHeader("card name"),
      "folding removed a separator that distinguishes two headers");
    assert(MAP.foldHeader("Card Number") !== MAP.foldHeader("Card Name"),
      "two different headers folded together");
  });

  test("ignored columns change nothing about a row", () => {
    const withNoise = oneRow({ "Market Value": "999999", Notes: "=cmd", "Image URL": "http://x" });
    const clean = oneRow({ "Market Value": "", Notes: "", "Image URL": "" });
    const a = normalizeOne(mapper(), withNoise, 2);
    const b = normalizeOne(mapper(), clean, 2);
    assert(a.ok && b.ok, json(a.invalid || b.invalid));
    eq(json(a.record.identity), json(b.record.identity), "an ignored column changed identity");
    eq(json(a.record.copy), json(b.record.copy), "an ignored column changed the copy");
  });

  test("whitespace and case are forgiven in a value, and the original is what is quoted back", () => {
    const out = normalizeOne(mapper(), oneRow({ Foil: "  HOLO  ", Edition: "1ST ED",
      "Card Name": "  Charizard  " }), 2);
    assert(out.ok, json(out.invalid));
    eq(out.record.identity.dimensions.finish, "holofoil");
    eq(out.record.identity.dimensions.printRun, "first_edition");
    eq(out.record.identity.cardName, "Charizard", "a trimmed name kept its spaces");
    const bad = normalizeOne(mapper(), oneRow({ Foil: "  Rainbow  " }), 2);
    assert(!bad.ok);
    assert(bad.invalid.detail.includes('"Rainbow"'),
      "the refusal did not quote what the file said: " + bad.invalid.detail);
  });

  test("a blank identity field is never filled in", () => {
    for (const [header, field] of [["Card Name", "cardName"], ["Set Code", "expansion"],
      ["Card Number", "collectorNumber"]]) {
      const out = normalizeOne(mapper(), oneRow({ [header]: "   " }), 2);
      assert(!out.ok, `a blank ${field} was accepted`);
      eq(out.invalid.reason, INVALID.blankIdentity, json(out.invalid));
      eq(out.invalid.field, field);
    }
  });

  test("a printing the file does not state is recorded as SILENCE, never as a default", () => {
    const out = normalizeOne(mapper(), oneRow({ Edition: "", Foil: "", Language: "" }), 2);
    assert(out.ok, json(out.invalid));
    const d = out.record.identity.dimensions;
    eq(json(d), json({}), "silence became a stated printing: " + json(d));
    /* And the mapper never calls the thing that would do it. */
    assert(!/withDefaults/.test(code("server/inventory/mapping.js")),
      "the mapper defaults a dimension the file did not state");
    assert(!/withDefaults/.test(code("server/inventory/resolve.js")),
      "resolution defaults a dimension the file did not state");
  });

  test("an unknown word in any dimension is refused by name, never coerced", () => {
    for (const [header, field] of [["Foil", "finish"], ["Edition", "printRun"],
      ["Language", "language"]]) {
      const out = normalizeOne(mapper(), oneRow({ [header]: "Something Nobody Taught Us" }), 2);
      assert(!out.ok, `an unknown ${field} was accepted`);
      eq(out.invalid.reason, INVALID.unknownWord, json(out.invalid));
      eq(out.invalid.field, field);
    }
  });

  test("money is read the way a person writes it, and refused when it is not a number", () => {
    const ok = {
      "1150": 1150, "1,150": 1150, "1,150.00": 1150, "$1,150": 1150, "£1,150.00": 1150,
      "0": 0, "0.50": 0.5,
    };
    for (const [written, amount] of Object.entries(ok)) {
      const out = normalizeOne(mapper(), oneRow({ "Listed Price": written }), 2);
      assert(out.ok, `"${written}" was refused: ${json(out.invalid)}`);
      eq(out.record.copy.ask, amount, `"${written}" read as ${out.record.copy.ask}`);
      eq(typeof out.record.copy.ask, "number", `"${written}" is not a JS number`);
    }
    /* EVERY ONE OF THESE IS A WRONG NUMBER THAT THE DOMAIN WOULD HAVE ACCEPTED.
       `Number("")` is 0, `Number(true)` is 1, `Number([])` is 0 — the domain
       validates through `Number(...)` and stores what it was handed, so each of
       these becomes either a fabricated price or a string the shop's own screen
       renders as nothing at all. */
    for (const written of ["nine hundred", "-5", "1 150", "1.2.3", "", " ", "1e5",
      "(100)", "100-200", "true", "$", "NaN", "Infinity"]) {
      const out = normalizeOne(mapper(), oneRow({ "Listed Price": written }), 2);
      if (!written.trim()) {
        assert(out.ok && out.record.copy.ask === undefined,
          `a blank price became ${json(out.ok ? out.record.copy.ask : out.invalid)}`);
        continue;
      }
      assert(!out.ok, `"${written}" was accepted as money`);
      eq(out.invalid.reason, INVALID.badNumber, `"${written}": ${json(out.invalid)}`);
    }
  });

  test("a blank amount is absence, which is a different thing from zero", () => {
    const blank = normalizeOne(mapper(), oneRow({ "Listed Price": "", "Purchase Price": "" }), 2);
    assert(blank.ok);
    assert(!("ask" in blank.record.copy) && !("cost" in blank.record.copy),
      "a blank amount became a value: " + json(blank.record.copy));
    const zero = normalizeOne(mapper(), oneRow({ "Listed Price": "0" }), 2);
    eq(zero.record.copy.ask, 0, "an explicit zero was lost");
  });

  test("quantity: absent means one, and zero means somebody meant to delete the row", () => {
    /* The fixture's first row is a certified slab, and a cert may not be shared
       across copies — so quantity is exercised on a row without one. */
    const noCert = (edits) => oneRow({ "Cert Number": "", Grader: "", Grade: "",
      Condition: "NM", ...edits });
    eq(normalizeOne(mapper(), noCert({ Quantity: "" }), 2).record.quantity, 1);
    eq(normalizeOne(mapper(), noCert({ Quantity: "3" }), 2).record.quantity, 3);
    for (const written of ["0", "-1", "1.5", "two", "1e3"]) {
      const out = normalizeOne(mapper(), noCert({ Quantity: written }), 2);
      assert(!out.ok, `quantity "${written}" was accepted`);
      eq(out.invalid.reason, INVALID.badQuantity, `"${written}": ${json(out.invalid)}`);
    }
  });

  test("a grade MetYet cannot hold is refused as ungradeable, not flattened to a PSA number", () => {
    for (const [grader, grade] of [["BGS", "9.5"], ["CGC", "10"], ["SGC", "9"],
      ["PSA", "9.5"], ["PSA", "11"], ["PSA", "0"]]) {
      const out = normalizeOne(mapper(), oneRow({ Grader: grader, Grade: grade, Condition: "",
        "Cert Number": "" }), 2);
      assert(!out.ok, `${grader} ${grade} was accepted`);
      eq(out.invalid.reason, INVALID.ungradeable, `${grader} ${grade}: ${json(out.invalid)}`);
      assert(/PSA 1–10/.test(out.invalid.detail), "the reason does not say why: " + out.invalid.detail);
    }
    /* And the ones it CAN hold, in the shape the domain spells them. */
    for (let n = 1; n <= 10; n += 1) {
      const out = normalizeOne(mapper(), oneRow({ Grader: "psa", Grade: String(n), Condition: "",
        "Cert Number": "" }), 2);
      assert(out.ok, `PSA ${n} was refused: ${json(out.invalid)}`);
      eq(out.record.copy.grade, `PSA ${n}`);
      assert(D.GRADED_VALUES.includes(out.record.copy.grade), "not a word the domain holds");
    }
  });

  test("half a grade is refused: a grader with no number, or a number with no grader", () => {
    const a = normalizeOne(mapper(), oneRow({ Grader: "PSA", Grade: "", Condition: "",
      "Cert Number": "" }), 2);
    assert(!a.ok && a.invalid.reason === INVALID.blankIdentity, json(a.invalid));
    const b = normalizeOne(mapper(), oneRow({ Grader: "", Grade: "9", Condition: "",
      "Cert Number": "" }), 2);
    assert(!b.ok && b.invalid.reason === INVALID.blankIdentity, json(b.invalid));
  });

  test("the raw-versus-graded rule is the domain's, asked before a write not after", () => {
    /* graded AND a condition */
    const both = normalizeOne(mapper(), oneRow({ Grader: "PSA", Grade: "9", Condition: "NM" }), 2);
    assert(!both.ok, "a graded card kept a raw condition");
    eq(both.invalid.reason, INVALID.gradingIncoherent, json(both.invalid));
    /* a condition alone is legal, and so is saying nothing at all */
    const raw = normalizeOne(mapper(), oneRow({ Grader: "", Grade: "", Condition: "LP",
      "Cert Number": "" }), 2);
    assert(raw.ok, json(raw.invalid));
    eq(raw.record.copy.condition, "Lightly Played");
    assert(!("grade" in raw.record.copy), "a condition invented a grade");
    const silent = normalizeOne(mapper(), oneRow({ Grader: "", Grade: "", Condition: "",
      "Cert Number": "" }), 2);
    assert(silent.ok, json(silent.invalid));
    eq(json(Object.keys(silent.record.copy).filter((k) => k === "grade" || k === "condition")),
      json([]), "silence became a grading claim");
    /* and whatever the mapper produces, the domain agrees with it */
    for (const out of [raw, silent]) eq(D.gradingProblem(out.record.copy), null, json(out.record.copy));
  });

  test("a grade and a separate grader in one row is a template mistake, said so", () => {
    const custom = createMapper({ template: { name: "both",
      columns: { cardName: "Card", expansion: "Set", collectorNumber: "No",
        grade: "Grade", gradingCompany: "Grader", numericGrade: "Num" } } });
    const out = custom.normalize(["Charizard", "BASE1", "4", "PSA 9", "PSA", "9"],
      ["Card", "Set", "No", "Grade", "Grader", "Num"], { at: 2 });
    assert(!out.ok, "two grade columns were merged silently");
    eq(out.invalid.reason, INVALID.tooManyValues, json(out.invalid));
  });

  test("a source row id is a diagnostic and reaches no card and no copy", () => {
    const out = normalizeOne(mapper(), fixture(), 2);
    assert(out.ok, json(out.invalid));
    eq(out.record.source.rowId, "CLR-0001", "the source id was lost from the diagnostics");
    assert(!json(out.record.copy).includes("CLR-0001"), "a provider row id reached the copy");
    assert(!json(out.record.identity).includes("CLR-0001"), "a provider row id reached identity");
    eq(out.record.source.portfolio, "Vintage Holos");
    assert(!json(out.record.copy).includes("Vintage"), "a portfolio name reached the copy");
  });

  test("nothing but the domain's own fields reaches the copy", () => {
    /* `addInventoryCopy` does not whitelist its input, so a stray key would live
       on the row for ever and `updateInventoryCopy` could never remove it. */
    const allowed = new Set(["grade", "condition", "cert", "ask", "cost"]);
    for (const line of [2, 3, 4, 5, 6, 7, 8, 9, 19, 20]) {
      const out = normalizeOne(mapper(), fixture(), line);
      if (!out.ok) continue;
      for (const key of Object.keys(out.record.copy)) {
        assert(allowed.has(key), `line ${line} put "${key}" on the copy`);
      }
    }
  });
});

/* ========================================================== D. RESOLVING A CARD */
describe("D. one card, no card, or too many — and never a guess", () => {

  test("an exactly-stated printing resolves to exactly one canonical card", async () => {
    const ctx = await world();
    const made = await stockCatalog(ctx);
    const found = await resolveIdentity(ctx.catalog, { cardName: "Charizard",
      expansion: "BASE1", collectorNumber: "4",
      dimensions: { printRun: "unlimited", finish: "holofoil", language: "en" } });
    eq(found.outcome, OUTCOME.resolved, json(found));
    eq(found.card.canonicalCardId, made.zardUnlimited);
  });

  test("silence is not ambiguous when the card has only one printing", async () => {
    const ctx = await world();
    const made = await stockCatalog(ctx);
    const found = await resolveIdentity(ctx.catalog,
      { cardName: "Blastoise", expansion: "BASE1", collectorNumber: "2", dimensions: {} });
    eq(found.outcome, OUTCOME.resolved, json(found));
    eq(found.card.canonicalCardId, made.blastoise);
  });

  test("silence IS ambiguous when the card has several, and nothing is chosen", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const found = await resolveIdentity(ctx.catalog,
      { cardName: "Charizard", expansion: "BASE1", collectorNumber: "4", dimensions: {} });
    eq(found.outcome, OUTCOME.ambiguous, json(found));
    eq(found.reason, REASON.manyPrintings);
    eq(found.candidates.length, 3, "the candidates were not all offered");
    assert(!found.card, "a card was chosen from an ambiguity");
    assert(/printRun/.test(found.detail), "the reason does not say what is missing: " + found.detail);
  });

  test("a partly-stated printing that still matches several is ambiguous too", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const found = await resolveIdentity(ctx.catalog, { cardName: "Charizard",
      expansion: "BASE1", collectorNumber: "4", dimensions: { finish: "holofoil" } });
    eq(found.outcome, OUTCOME.ambiguous, json(found));
    eq(found.candidates.length, 3);
  });

  test("a release MetYet does not hold is unresolved, and says which code it looked for", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const found = await resolveIdentity(ctx.catalog,
      { cardName: "Pikachu", expansion: "NOSUCHSET", collectorNumber: "58", dimensions: {} });
    eq(found.outcome, OUTCOME.unresolved, json(found));
    eq(found.reason, REASON.noExpansion);
    assert(found.detail.includes("NOSUCHSET"), found.detail);
  });

  test("a card MetYet does not hold is unresolved, by number and by name", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    for (const identity of [
      { cardName: "Notacard", expansion: "BASE1", collectorNumber: "999" },
      { cardName: "Charizard", expansion: "BASE1", collectorNumber: "777" },
      { cardName: "Nothing Like It", expansion: "BASE1", collectorNumber: "4" },
    ]) {
      const found = await resolveIdentity(ctx.catalog, { ...identity, dimensions: {} });
      eq(found.outcome, OUTCOME.unresolved, json(found));
      eq(found.reason, REASON.noCard, json(found));
    }
  });

  test("a printing MetYet does not hold is unresolved, and shows what it does hold", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const found = await resolveIdentity(ctx.catalog, { cardName: "Pikachu",
      expansion: "BASE1", collectorNumber: "58",
      dimensions: { printRun: "unlimited", finish: "non_holo" } });
    eq(found.outcome, OUTCOME.unresolved, json(found));
    eq(found.reason, REASON.noPrinting, json(found));
    eq(found.candidates.length, 1, "the printings it does hold were not shown");
    eq(found.candidates[0].printRun, "first_edition");
  });

  test("the lookup is case-folded exactly where the catalog's own key is", async () => {
    const ctx = await world();
    const made = await stockCatalog(ctx);
    /* The NAME folds and the NUMBER does not, because that is what
       `cardContextNaturalKey` does — and an importer that disagreed with the key
       would file cards under a context the write would not have chosen. */
    const byCase = await resolveIdentity(ctx.catalog, { cardName: "cHaRiZaRd",
      expansion: "base1", collectorNumber: "4",
      dimensions: { printRun: "unlimited", finish: "holofoil" } });
    eq(byCase.outcome, OUTCOME.resolved, json(byCase));
    eq(byCase.card.canonicalCardId, made.zardUnlimited);
    const byNumber = await resolveIdentity(ctx.catalog, { cardName: "Charizard",
      expansion: "BASE1", collectorNumber: "04", dimensions: {} });
    eq(byNumber.outcome, OUTCOME.unresolved, "a padded number was guessed to be the same card");
  });

  test("a withdrawn printing is not a candidate", async () => {
    const ctx = await world();
    const made = await stockCatalog(ctx);
    await ctx.catalog.withdrawCanonicalCard(made.zardShadowless);
    const found = await resolveIdentity(ctx.catalog,
      { cardName: "Charizard", expansion: "BASE1", collectorNumber: "4",
        dimensions: { printRun: "shadowless", finish: "holofoil" } });
    eq(found.outcome, OUTCOME.unresolved, json(found));
    const still = await resolveIdentity(ctx.catalog,
      { cardName: "Charizard", expansion: "BASE1", collectorNumber: "4", dimensions: {} });
    eq(still.candidates.length, 2, "a withdrawn printing is still offered");
  });

  test("two cards sharing a number and a name are ambiguous, not first-wins", async () => {
    const ctx = await world();
    const made = await stockCatalog(ctx);
    /* The discriminator exists for exactly this, and a spreadsheet carries none. */
    const { cardContextId } = await ctx.catalog.putCardContext({ game: "pokemon",
      expansionId: made.expansionId, collectorNumber: "63", cardName: "Mudkip",
      discriminator: "second-artwork" });
    await ctx.catalog.putCanonicalCard({ cardContextId,
      ...CI.withDefaults({ printRun: "unlimited", finish: "non_holo" }) });
    const found = await resolveIdentity(ctx.catalog, { cardName: "Mudkip",
      expansion: "BASE1", collectorNumber: "63",
      dimensions: { printRun: "unlimited", finish: "non_holo" } });
    eq(found.outcome, OUTCOME.ambiguous, json(found));
    eq(found.reason, REASON.manyCards, json(found));
    eq(found.candidates.length, 2);
    assert(!found.card, "one of two cards was chosen");
  });

  test("resolution reads the catalog and writes nothing to it", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const before = await ctx.pg.query("select count(*)::int as n from metyet_catalog.canonical_cards");
    const contexts = await ctx.pg.query("select count(*)::int as n from metyet_catalog.card_contexts");
    for (const identity of [
      { cardName: "Notacard", expansion: "BASE1", collectorNumber: "999" },
      { cardName: "Pikachu", expansion: "NOSUCHSET", collectorNumber: "58" },
      { cardName: "Charizard", expansion: "BASE1", collectorNumber: "4" },
    ]) await resolveIdentity(ctx.catalog, { ...identity, dimensions: {} });
    const after = await ctx.pg.query("select count(*)::int as n from metyet_catalog.canonical_cards");
    const after2 = await ctx.pg.query("select count(*)::int as n from metyet_catalog.card_contexts");
    eq(after.rows[0].n, before.rows[0].n, "resolution minted a canonical card");
    eq(after2.rows[0].n, contexts.rows[0].n, "resolution minted a card context");
    /* And it could not have: nothing in the mapping layer can write to the catalog. */
    for (const rel of ["server/inventory/resolve.js", "server/inventory/mapping.js"]) {
      assert(!/put(Expansion|CardContext|CanonicalCard)|insert into/.test(code(rel)),
        rel + " can write to the catalog");
    }
  });
});

/* ============================================================== E. PREVIEWING */
describe("E. a preview classifies everything and writes nothing", () => {

  const previewFixture = async (ctx) => plan({ csv: fixture(), mapper: mapper(),
    catalog: ctx.catalog, partnerId: "p1",
    world: await ctx.repository.loadWorld() });

  test("every row of the file lands in exactly one bucket, with a reason", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const made = await previewFixture(ctx);
    eq(made.counts.rows, 22, "the fixture's rows changed");
    eq(made.importable.length + made.rejected.length, made.counts.rows,
      "a row was silently dropped");
    for (const row of made.rejected) {
      assert(row.reason && row.detail, `line ${row.line} has no reason: ${json(row)}`);
      assert(Object.values(CLASS).includes(row.klass), `line ${row.line}: ${row.klass}`);
      assert(Number.isInteger(row.line) && row.line >= 2, "a row has no line number");
    }
    /* The line numbers count the header, so they match what a spreadsheet shows. */
    eq(json(made.rejected.map((r) => r.line).slice(0, 3)), json([6, 8, 9]),
      json(made.rejected.map((r) => r.line)));
    /* And the numbers are the FILE's lines, which is only the same thing while
       no row is blank and no cell spans two lines. */
    const { lines } = parseCsv(fixture());
    assert(made.rejected.every((r) => lines.includes(r.line)),
      "a reported line is not a line of the file");
  });

  test("the fixture's buckets are the ones it was written to produce", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const made = await previewFixture(ctx);
    const by = (klass) => made.rejected.filter((r) => r.klass === klass).map((r) => r.line);
    /* invalid: refused by the mapper before the catalog was asked */
    eq(json(by(CLASS.invalid)), json([10, 11, 12, 13, 14, 15, 16, 17, 20, 21, 22, 23]),
      json(by(CLASS.invalid)));
    /* unresolved: the catalog does not hold it */
    eq(json(by(CLASS.unresolved)), json([8, 9]), json(by(CLASS.unresolved)));
    /* ambiguous: line 6 states no edition for a Charizard with three printings */
    eq(json(by(CLASS.ambiguous)), json([6]), json(by(CLASS.ambiguous)));
    eq(made.importable.length, 7, json(made.importable.map((r) => r.line)));
    /* and quantity is counted in copies, not rows: line 4 is two, line 19 is three */
    /* 2,3,5,7,18 are one each; line 4 is two Alakazams and line 19 is three
       Mudkips — seven rows, ten copies. */
    eq(made.counts.copies, 10, json(made.importable.map((r) => [r.line, r.quantity])));
  });

  test("a preview cannot write, because it is not given anything to write with", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const before = await ctx.repository.readVersion();
    const made = await previewFixture(ctx);
    assert(made.importable.length > 0, "nothing was importable, so this proves nothing");
    eq((await ctx.repository.loadWorld()).inventory.length, 0, "a preview wrote inventory");
    eq(await ctx.repository.readVersion(), before, "a preview bumped the world version");
    /* Structurally, not just observably: `plan` takes no repository and no
       runtime, so there is nothing for a flag to get wrong. */
    const signature = code("server/inventory/import.js")
      .slice(code("server/inventory/import.js").indexOf("async function plan("));
    const head = signature.slice(0, signature.indexOf(")"));
    assert(!/repository|runtime/.test(head), "plan() accepts something it could write with: " + head);
  });

  test("cancelling is not an action: a plan that is never applied leaves nothing", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const made = await previewFixture(ctx);
    /* Nothing is called. This is what "back" means when preview and import are
       two invocations rather than two branches of one. */
    eq((await ctx.repository.loadWorld()).inventory.length, 0, "an unapplied plan wrote");
    eq(made.written, false, "a plan claims to have been written");
  });

  test("a plan says what the shelf already holds, before it adds more", async () => {
    const ctx = await world();
    const made = await stockCatalog(ctx);
    const res = await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: made.blastoise, condition: "Near Mint" } });
    eq(res.statusCode, 200, res.body);
    const preview = await plan({ csv: fixture(), mapper: mapper(), catalog: ctx.catalog,
      partnerId: "p1", world: await ctx.repository.loadWorld() });
    const blastoiseRow = preview.importable.find((r) => r.card.canonicalCardId === made.blastoise);
    assert(blastoiseRow, "Blastoise did not resolve");
    eq(blastoiseRow.alreadyOnShelf, 1, "the plan did not notice the copy already there");
    /* Nobody else's shelf counts. */
    const other = await plan({ csv: fixture(), mapper: mapper(), catalog: ctx.catalog,
      partnerId: "p2", world: await ctx.repository.loadWorld() });
    eq(other.importable.find((r) => r.card.canonicalCardId === made.blastoise).alreadyOnShelf, 0,
      "another partner's copy was counted against this shelf");
  });

  test("the plan carries the provisional disclaimer wherever the template is named", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const made = await previewFixture(ctx);
    eq(made.template.provisional, true, "the plan lost the disclaimer");
    assert(/provisional/i.test(made.template.name), made.template.name);
  });

  test("--limit reads the first n rows and says so", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const made = await plan({ csv: fixture(), mapper: mapper(), catalog: ctx.catalog,
      partnerId: "p1", limit: 3 });
    eq(made.counts.rows, 3);
    eq(made.skipped, 19, "the unread rows were not reported");
  });
});

/* =============================================================== F. IMPORTING */
describe("F. importing goes through the shelf's own door", () => {

  const approved = async (ctx, partnerId = "p1") => {
    const made = await plan({ csv: fixture(), mapper: mapper(), catalog: ctx.catalog,
      partnerId, world: await ctx.repository.loadWorld() });
    return { made, result: await apply({ plan: made, repository: ctx.repository,
      runtime: RT.systemRuntime(), partnerId, catalog: ctx.catalog }) };
  };

  test("approved rows become inventory copies on that partner's shelf", async () => {
    const ctx = await world();
    const made = await stockCatalog(ctx);
    const { made: preview, result } = await approved(ctx);
    eq(result.refused, null, json(result.refused));
    eq(result.written, preview.counts.copies, "a different number was written than planned");
    const rows = await shelf(ctx, "p1");
    eq(rows.length, preview.counts.copies, "the shelf does not hold what was written");
    eq((await shelf(ctx, "p2")).length, 0, "a copy landed on another shelf");
    /* Every row is a real canonical card, carrying the facts the file stated. */
    for (const row of rows) {
      assert(typeof row.canonicalCardId === "string" && row.canonicalCardId,
        "a copy has no canonical card: " + json(row));
      assert(await ctx.catalog.findSelectableCanonicalCard(row.canonicalCardId),
        "a copy names a card the catalog will not offer");
      eq(D.gradingProblem(row), null, "an incoherent copy was written: " + json(row));
    }
    const zard = rows.find((r) => r.canonicalCardId === made.zardUnlimited);
    assert(zard, "the graded Charizard did not land");
    eq(zard.grade, "PSA 9");
    eq(zard.cert, "70551201");
    eq(zard.ask, 4200);
    eq(typeof zard.ask, "number", "a money value was stored as a string");
    eq(zard.cost, 3276);
    assert(!("condition" in zard) || zard.condition == null, "a graded copy kept a condition");
  });

  test("quantity becomes that many separate copies, because a copy is a thing", async () => {
    const ctx = await world();
    const made = await stockCatalog(ctx);
    await approved(ctx);
    const rows = await shelf(ctx, "p1");
    /* Line 4 is two Alakazams; line 19 is three Mudkips, and line 7 is a fourth. */
    eq(rows.filter((r) => r.canonicalCardId === made.alakazam).length, 2, "quantity 2 did not expand");
    eq(rows.filter((r) => r.canonicalCardId === made.mudkip).length, 4, "quantity 3 did not expand");
    const ids = new Set(rows.map((r) => r.invId));
    eq(ids.size, rows.length, "two copies share an invId");
  });

  test("it is the ordinary command, not a second write path", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const body = code("server/inventory/import.js");
    assert(/addInventoryCopy/.test(body), "the runner does not use the inventory command");
    assert(!/insert into|update .*set |db\.transaction|saveWorld/.test(body),
      "the runner writes rows itself");
    /* Every invariant the command enforces still applies — asked by handing the
       command something it must refuse and watching the whole batch fail. */
    const made = await plan({ csv: oneRow({ Grader: "", Grade: "", Condition: "NM",
      "Cert Number": "", "Listed Price": "620", "Card Name": "Blastoise", "Card Number": "2" }),
      mapper: mapper(), catalog: ctx.catalog, partnerId: "p1" });
    eq(made.importable.length, 1, json(made.rejected));
    made.importable[0].copy.grade = "Raw";      // raw with no condition — the domain refuses
    delete made.importable[0].copy.condition;
    const result = await apply({ plan: made, repository: ctx.repository,
      runtime: RT.systemRuntime(), partnerId: "p1", catalog: ctx.catalog });
    assert(result.refused, "the domain accepted a raw copy with no condition");
    eq(result.refused.reason, "grading-incoherent", json(result.refused));
    eq((await shelf(ctx, "p1")).length, 0, "a refused batch wrote something");
  });

  test("one refusal rolls the whole batch back — no half shelf", async () => {
    const ctx = await world();
    const made = await stockCatalog(ctx);
    const preview = await plan({ csv: fixture(), mapper: mapper(), catalog: ctx.catalog,
      partnerId: "p1" });
    assert(preview.importable.length >= 3, "too few rows to prove a batch");
    /* Break the LAST row only. Everything before it is valid, so a per-row
       transaction would have committed them and left a shelf nobody can
       reconcile against the file. */
    preview.importable[preview.importable.length - 1].copy.ask = -1;
    const result = await apply({ plan: preview, repository: ctx.repository,
      runtime: RT.systemRuntime(), partnerId: "p1" });
    assert(result.refused, "a negative amount was accepted");
    eq(result.refused.reason, "invalid-amount", json(result.refused));
    eq(result.refused.line, preview.importable[preview.importable.length - 1].line,
      "the refusal did not name the row that caused it");
    eq((await shelf(ctx, "p1")).length, 0, "the batch committed a partial shelf");
    eq(await ctx.repository.readVersion(), 1, "a failed batch bumped the world version");
    assert(await ctx.catalog.findSelectableCanonicalCard(made.blastoise), "the catalog was harmed");
  });

  test("a database fault mid-batch leaves nothing behind", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const preview = await plan({ csv: fixture(), mapper: mapper(), catalog: ctx.catalog,
      partnerId: "p1" });
    /* Fail the save itself, which is the closest a test can get to the disk
       going away while a batch is in flight. */
    const broken = { ...ctx.repository,
      saveWorld: async () => { throw new Error("the disk went away"); } };
    let threw = null;
    try {
      await apply({ plan: preview, repository: broken, runtime: RT.systemRuntime(), partnerId: "p1" });
    } catch (error) { threw = error; }
    assert(threw, "a database fault was swallowed");
    eq((await shelf(ctx, "p1")).length, 0, "a faulted batch left copies behind");
  });

  test("re-running the same file duplicates, deliberately and visibly", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const first = await approved(ctx);
    const before = (await shelf(ctx, "p1")).length;
    const second = await approved(ctx);
    eq(second.result.written, first.result.written, "the second run wrote a different amount");
    eq((await shelf(ctx, "p1")).length, before * 2, "a re-run did something other than duplicate");
    /* And it was SAID, before the write, rather than discovered afterwards. */
    const third = await plan({ csv: fixture(), mapper: mapper(), catalog: ctx.catalog,
      partnerId: "p1", world: await ctx.repository.loadWorld() });
    assert(third.importable.every((r) => r.alreadyOnShelf >= 2),
      "the third plan did not warn that the shelf already holds these");
  });

  test("an archived copy is not counted as already held", async () => {
    const ctx = await world();
    const made = await stockCatalog(ctx);
    const res = await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: made.blastoise, condition: "Near Mint" } });
    const invId = res.json().value;   // the command answers with the id itself
    const gone = await post(ctx.app, "north", "removeInventoryCopy", { invId });
    eq(gone.statusCode, 200, gone.body);
    const preview = await plan({ csv: fixture(), mapper: mapper(), catalog: ctx.catalog,
      partnerId: "p1", world: await ctx.repository.loadWorld() });
    eq(preview.importable.find((r) => r.card.canonicalCardId === made.blastoise).alreadyOnShelf, 0,
      "an archived copy was counted as still on the shelf");
  });

  test("a plan with nothing importable writes nothing and does not fail", async () => {
    const ctx = await world();
    /* No catalog at all, which is the honest state of MetYet today. */
    const made = await plan({ csv: fixture(), mapper: mapper(), catalog: ctx.catalog,
      partnerId: "p1" });
    eq(made.importable.length, 0, "something resolved against an empty catalog");
    eq(made.counts.unresolved + made.counts.invalid + made.counts.ambiguous, made.counts.rows,
      "a row went missing");
    const result = await apply({ plan: made, repository: ctx.repository,
      runtime: RT.systemRuntime(), partnerId: "p1" });
    eq(result.written, 0);
    eq((await shelf(ctx, "p1")).length, 0);
  });

  test("the imported copies are the ones the shop's own screen can read", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    await approved(ctx);
    const state = (await ctx.app.inject({ method: "GET", url: "/api/view",
      headers: { authorization: "Bearer north" } })).json().state;
    assert(state.inventory.length > 0, "the shop cannot see what was imported");
    for (const row of state.inventory) {
      assert(!("provider" in row) && !("sourceRowId" in row) && !("portfolio" in row),
        "a source field reached the shop's screen: " + json(row));
      if (row.ask != null) eq(typeof row.ask, "number", "an amount is not a number: " + json(row));
    }
  });
});

/* =========================================================== G. AUTHORISATION */
describe("G. whose shelf this is", () => {

  test("the partner comes from the caller, never from the file", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    /* The fixture carries a `Collection` column and a source row id. Neither is
       a partner, and there is no column that could be one. */
    const body = code("server/inventory/import.js") + code("server/inventory/mapping.js");
    assert(!/partnerId\s*[:=]\s*(row|record|source|cells|copy)\b/.test(body),
      "a partner is read out of a row");
    const made = await plan({ csv: fixture(), mapper: mapper(), catalog: ctx.catalog,
      partnerId: "p1" });
    /* The portfolio is carried in `source`, for a person reading a report, and
       must not be in `copy`, which is what the command receives. */
    for (const row of made.importable) {
      assert(!json(row.copy).includes("Vintage"), "a portfolio name reached the payload");
      assert(!json(row.copy).includes("CLR-"), "a source row id reached the payload");
    }
    assert(made.importable.some((r) => r.source.portfolio),
      "the portfolio was dropped from the diagnostics instead of kept out of the payload");
  });

  test("a plan made for one shop cannot be applied to another", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const made = await plan({ csv: fixture(), mapper: mapper(), catalog: ctx.catalog,
      partnerId: "p1" });
    let threw = null;
    try {
      await apply({ plan: made, repository: ctx.repository, runtime: RT.systemRuntime(),
        partnerId: "p2" });
    } catch (error) { threw = error; }
    assert(threw, "a plan for p1 was written to p2's shelf");
    eq((await shelf(ctx, "p2")).length, 0);
    eq((await shelf(ctx, "p1")).length, 0);
  });

  test("a Collector cannot import inventory, and neither can nobody", async () => {
    const ctx = await world();
    const made = await stockCatalog(ctx);
    /* The command is the gate, and it is the same gate as always: the seat. */
    const asCollector = await post(ctx.app, "casey", "addInventoryCopy",
      { copy: { canonicalCardId: made.blastoise, condition: "Near Mint" } });
    assert(asCollector.statusCode !== 200, "a Collector stocked a shelf");
    eq(asCollector.json().error.refused, "not-owner", asCollector.body);
    const anonymous = await ctx.app.inject({ method: "POST", url: "/api/commands",
      payload: { command: "addInventoryCopy", payload: { copy: {} } } });
    assert(anonymous.statusCode >= 400, "an anonymous caller reached a command");
    /* And a plan applied with a collector's id is not a partner, so the command
       refuses it — the runner has no other actor to offer. */
    const plan1 = await plan({ csv: fixture(), mapper: mapper(), catalog: ctx.catalog,
      partnerId: "c1" });
    const result = await apply({ plan: plan1, repository: ctx.repository,
      runtime: RT.systemRuntime(), partnerId: "c1" });
    assert(result.refused, "a collector id was accepted as a shelf owner");
    eq((await ctx.repository.loadWorld()).inventory.length, 0);
  });

  test("there is no HTTP way in, and the production door did not move", async () => {
    const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
    eq(EXPOSED_COMMANDS.length, 21, "C8 opened a production command: " + EXPOSED_COMMANDS.join(","));
    /* 49 → 50 in Option B (`setCopyPending`). C8's claim is unchanged: C8 added
       no domain command, and the door it is really guarding — the allow-list
       above — has not moved either. */
    eq(Object.keys(require("../domain/metyet-commands.js").COMMANDS).length, 50,
      "C8 added a domain command");
    const app = code("server/app.js");
    assert(!/inventory-import|inventoryImport|\/api\/inventory|csv/i.test(app),
      "an inventory import route was mounted");
    /* Nor can the runner be reached by one: it is required only by the CLI. */
    const requiredBy = ["server/app.js", "client/commands.js", "app-src/main.jsx"]
      .filter((rel) => /inventory\/(import|mapping|templates|resolve)/.test(read(rel)));
    eq(json(requiredBy), json([]), "the runner is reachable from " + requiredBy.join(","));
  });

  test("no path, key or command is ever taken from a cell", () => {
    const body = code("server/inventory/mapping.js") + code("server/inventory/import.js")
      + code("server/inventory/resolve.js");
    assert(!/readFile|writeFile|readdir|createReadStream|fs\./.test(body),
      "the mapping layer touches the filesystem");
    /* The CLI reads the two files, by the flags an operator passed, and parses
       rather than requiring them — the same rule catalog-import follows. */
    const cli = code("server/cli.js");
    const buildMapper = cli.slice(cli.indexOf("function buildMapper("), cli.indexOf("function readTextFile("));
    assert(/JSON\.parse/.test(buildMapper), "a mapping file is not parsed as JSON");
    assert(!/require\(\s*(path|flags|file)/.test(buildMapper), "a mapping path reaches require()");
  });
});

/* ====================================================== H. NO PROVIDER, NO NET */
describe("H. no provider, no network, no artwork", () => {

  test("nothing in the inventory layer names a provider or opens a socket", () => {
    for (const rel of ["server/inventory/mapping.js", "server/inventory/resolve.js",
      "server/inventory/import.js", "server/inventory/templates.js"]) {
      const body = read(rel);
      assert(!/scrydex|tcgdex|pokemontcg|collectr\.|cardladder/i.test(body),
        `${rel} names a provider's service`);
      assert(!/fetch\(|https?\.request|axios|node-fetch|undici|https?:\/\//.test(body),
        `${rel} reaches a network`);
      assert(!/apiKey|api_key|bearer|secret|token/i.test(body), `${rel} names a credential`);
    }
    /* "Collectr" appears as a TEMPLATE NAME, which is a label on configuration
       and not an integration — so it is allowed there and nowhere else. */
    const templates = read("server/inventory/templates.js");
    assert(/Collectr/.test(templates), "the provisional template lost its name");
    assert(!/collectr\.(com|io|app)/i.test(templates), "the template names a Collectr service");
  });

  test("no dependency was added", () => {
    const pkg = JSON.parse(read("package.json"));
    eq(json(Object.keys(pkg.dependencies || {}).sort()),
      json(["esbuild", "fastify", "jose", "pg", "react", "react-dom", "react-test-renderer"]),
      "a dependency was added: " + json(Object.keys(pkg.dependencies || {})));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    assert(!deps.some((d) => /csv|papa|xlsx|sheet|collectr|tcgdex|scrydex/i.test(d)),
      "a CSV or provider library was added: " + deps.join(","));
  });

  test("the fixture is declared synthetic where anybody would look", () => {
    const readme = read("tests/fixtures/README.md");
    assert(/not a Collectr export/i.test(readme), "the fixture README does not disclaim it");
    assert(/headers are a guess/i.test(readme), "it does not say the headers are invented");
    assert(/nothing was scraped/i.test(readme), "it does not say where the data came from");
    /* And the template that reads it says so too, so a report cannot quote one
       without the other. */
    assert(/PROVISIONAL|provisional/.test(read("server/inventory/templates.js")));
  });

  test("the fixture carries no real card image, url or third-party dataset", () => {
    const csv = fixture();
    assert(!/pokemontcg|tcgdex|scrydex/i.test(csv), "the fixture names a provider");
    /* It has an Image URL column, deliberately, because a real export would —
       and it is an ignored column pointing at example.test, which resolves
       nowhere. */
    assert(/example\.test/.test(csv), "the fixture's URL column is not an example domain");
    const columns = mapper().columnsFor(rowsOf(csv).headers);
    assert(columns.ignored.includes("Image URL"), "the image column is not ignored");
  });
});

/* ============================================ I. THE REST OF MetYet IS UNTOUCHED */
describe("I. and nothing else moved", () => {

  test("no migration, and 0013_binders.sql is still the newest", () => {
    const migrations = fs.readdirSync(path.join(ROOT, "persistence", "migrations")).sort();
    eq(migrations[migrations.length - 1], "0013_binders.sql", migrations.join(","));
  });

  test("the catalog gained a read and no write", () => {
    const body = code("persistence/catalog-repository.js");
    const found = body.slice(body.indexOf("async findCardIdentity("));
    const method = found.slice(0, found.indexOf("\n    },"));
    assert(/await read\(/.test(method), "the new lookup does not use the read-only path");
    assert(!/\brun\(|insert into|update |delete from/.test(method),
      "the new lookup can write: " + method.slice(0, 200));
  });

  test("Goals, Discovery, Binders and the Collector's own copies are unaffected", async () => {
    const ctx = await world();
    const made = await stockCatalog(ctx);
    await plan({ csv: fixture(), mapper: mapper(), catalog: ctx.catalog, partnerId: "p1" });
    /* A Collector can still want a card and see it on a partner's shelf, which
       is the loop the whole product is for. */
    /* A canonical goal must say what the Collector will accept — C3.2's rule,
       and nothing about C8 changes it. */
    const goal = await post(ctx.app, "casey", "addGoal",
      { canonicalCardId: made.mudkip, tier: "primary", desired: { condition: "Near Mint" } });
    eq(goal.statusCode, 200, goal.body);
    const preview = await plan({ csv: fixture(), mapper: mapper(), catalog: ctx.catalog,
      partnerId: "p1", world: await ctx.repository.loadWorld() });
    await apply({ plan: preview, repository: ctx.repository, runtime: RT.systemRuntime(),
      partnerId: "p1" });
    const state = (await ctx.app.inject({ method: "GET", url: "/api/view",
      headers: { authorization: "Bearer casey" } })).json().state;
    const wanted = state.goals.find((g) => g.canonicalCardId === made.mudkip);
    assert(wanted, "the Collector's goal vanished");
    /* Discovery derives from the imported copies exactly as it would from
       hand-entered ones — nothing about their origin reaches it. */
    assert(json(state).indexOf("CLR-00") === -1, "a source row id reached a Collector's screen");
  });

  test("the batch runner is the single-command runner's sibling, not a rival", () => {
    const body = code("persistence/command-transaction.js");
    assert(/executeCommands/.test(body), "the batch runner moved out of the transaction module");
    const batch = body.slice(body.indexOf("async function executeCommands("));
    for (const must of ["lockWorld", "readVersion", "loadWorld", "C.execute",
      "validateWorld", "saveWorld", "expectedVersion"]) {
      assert(batch.includes(must), `the batch skips ${must}`);
    }
    assert(/isRuntime|authoritative/.test(batch), "the batch accepts a prototype runtime");
  });

  test("a batch refuses a prototype runtime, exactly as one command does", async () => {
    const ctx = await world();
    const { executeCommands } = require("../persistence/command-transaction.js");
    let threw = null;
    try {
      await executeCommands(ctx.repository, { actor: { partnerId: "p1" },
        commands: [{ command: "addInventoryCopy", payload: { copy: {} } }],
        /* `deterministicRuntime` is authoritative too — it is scripted, not
           untrusted. The prototype runtime is the one that takes caller times
           and ids, and is the one a durable write must never accept. */
        runtime: RT.prototypeRuntime() });
    } catch (error) { threw = error; }
    assert(threw, "a batch ran on a runtime that trusts caller times and ids");
    assert(/authoritative/i.test(String(threw.message)), String(threw.message));
  });
});

/* ================================================== J. THE OPERATOR'S DOOR
   The CLI is the only surface this batch has, so it is tested as behaviour and
   not as a source grep. An earlier draft of this suite checked these verbs only
   with string searches, and a mutation making `--approve` default to TRUE — the
   single most dangerous change possible here, and the thing the verb's own
   comment calls "one typo away from a shelf nobody agreed to" — passed all 71
   tests. That is what an untested surface costs. */
describe("J. the operator's door", () => {

  test("the verbs are listed where an operator would look", async () => {
    const { out } = await cli([]);
    for (const verb of ["inventory-templates", "inventory-columns", "inventory-import"]) {
      assert(out.includes(verb), verb + " is not in the usage: " + out);
    }
    assert(/--approve/.test(out), "the usage does not mention how to actually import");
  });

  test("inventory-templates needs no database and names the provisional one as provisional", async () => {
    const { exit, out } = await cli(["inventory-templates"]);
    eq(exit, 0, out);
    assert(/PROVISIONAL/.test(out), "the provisional template is not flagged: " + out);
    assert(/collectr-provisional/.test(out));
    assert(/custom-spreadsheet/.test(out));
  });

  test("inventory-columns reports what a file's headers came out as, and writes nothing", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const file = csvFile(fixture());
    const { exit, out } = await cli(["inventory-columns", `--csv=${file}`,
      "--template=collectr-provisional"]);
    eq(exit, 0, out);
    assert(/mapped: *15/.test(out), out);
    assert(/Card Name +-> +cardName/.test(out), out);
    assert(/ignored: *Market Value/.test(out), out);
    eq((await ctx.repository.loadWorld()).inventory.length, 0, "a column report wrote inventory");
  });

  test("a header nothing reads, and a duplicated one, are reported and exit 3", async () => {
    const withExtra = fixture().replace("Item ID,", "Surprise,Item ID,").replace(/^(?!Item|Surprise)/gm, "x,");
    const { exit, out } = await cli(["inventory-columns", `--csv=${csvFile(withExtra, "extra.csv")}`,
      "--template=collectr-provisional"]);
    eq(exit, 3, out);
    assert(/unread: *Surprise/.test(out), out);
    const twice = fixture().replace("Condition,", "Condition,Condition,")
      .replace(/^(?!Item)/gm, (m, at) => m);
    const dup = await cli(["inventory-columns", `--csv=${csvFile(twice, "dup.csv")}`,
      "--template=collectr-provisional"]);
    assert(/duplicated: *Condition/.test(dup.out), dup.out);
    eq(dup.exit, 3, dup.out);
  });

  test("WITHOUT --approve nothing is written, and the report says so", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const { exit, out } = await cli(["inventory-import", "--partner=p1",
      `--csv=${csvFile(fixture())}`, "--template=collectr-provisional"], ctx);
    eq(exit, 3, out);                       // it previewed, and not every row resolved
    assert(/mode: *preview/.test(out), out);
    assert(/nothing was written/.test(out), out);
    assert(/importable: *7 rows -> 10 copies/.test(out), out);
    eq((await shelf(ctx, "p1")).length, 0, "a preview wrote inventory");
  });

  test("WITH --approve the copies are written, and the shelf holds them", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const { exit, out } = await cli(["inventory-import", "--partner=p1",
      `--csv=${csvFile(fixture())}`, "--template=collectr-provisional", "--approve"], ctx);
    eq(exit, 3, out);                       // imported, and still not every row resolved
    assert(/mode: *imported/.test(out), out);
    assert(/written: *10 copies/.test(out), out);
    eq((await shelf(ctx, "p1")).length, 10, "the shelf does not hold what the CLI said");
  });

  test("--approve means the word, not any truthy-looking thing", async () => {
    /* `--approve=yes` is an operator who thinks they asked for an import. A flag
       that quietly previews is better than one that quietly writes, so this pins
       which way the ambiguity falls — and pins that the DEFAULT is preview. */
    const ctx = await world();
    await stockCatalog(ctx);
    for (const flag of [[], ["--approve=no"], ["--approve=0"]]) {
      const { out } = await cli(["inventory-import", "--partner=p1", `--csv=${csvFile(fixture())}`,
        "--template=collectr-provisional", ...flag], ctx);
      assert(/mode: *preview/.test(out), `${json(flag)} wrote: ${out}`);
    }
    eq((await shelf(ctx, "p1")).length, 0, "a non-approval wrote inventory");
  });

  test("a missing or malformed invocation writes nothing and exits 2", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const bad = [
      ["inventory-import", "--template=collectr-provisional", `--csv=${csvFile(fixture())}`],  // no partner
      ["inventory-import", "--partner=p1", `--csv=${csvFile(fixture())}`],                      // no mapping
      ["inventory-import", "--partner=p1", `--csv=${csvFile(fixture())}`, "--template=nope"],
      ["inventory-import", "--partner=p1", `--csv=${csvFile(fixture())}`,
        "--template=collectr-provisional", "--mapping=/tmp/x.json"],                            // both
      ["inventory-import", "--partner=p1", "--template=collectr-provisional"],                   // no csv
      ["inventory-import", "--partner=p1", `--csv=${csvFile(fixture())}`,
        "--template=collectr-provisional", "--limit=0"],
    ];
    for (const argv of bad) {
      const { exit } = await cli(argv, ctx);
      eq(exit, 2, "not invalid invocation: " + json(argv));
      eq((await shelf(ctx, "p1")).length, 0, "an invalid invocation wrote: " + json(argv));
    }
  });

  test("a mapping file is parsed, and a broken one is an invalid invocation", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const good = csvFile(JSON.stringify({ name: "Ad hoc",
      columns: { cardName: "Card Name", expansion: "Set Code", collectorNumber: "Card Number" } }),
      "map.json");
    const ok = await cli(["inventory-columns", `--csv=${csvFile(fixture())}`, `--mapping=${good}`]);
    assert(/Ad hoc/.test(ok.out), ok.out);
    const broken = csvFile("{ not json", "broken.json");
    const bad = await cli(["inventory-columns", `--csv=${csvFile(fixture())}`, `--mapping=${broken}`]);
    eq(bad.exit, 1, bad.out);
    const invalid = csvFile(JSON.stringify({ name: "x", columns: { notAField: "Card Name" } }), "inv.json");
    const refused = await cli(["inventory-columns", `--csv=${csvFile(fixture())}`,
      `--mapping=${invalid}`]);
    eq(refused.exit, 2, refused.out);
  });

  test("an unreadable file is a failure, not a crash, and names no path contents", async () => {
    const ctx = await world();
    const { exit, out } = await cli(["inventory-import", "--partner=p1",
      "--csv=/definitely/not/here.csv", "--template=collectr-provisional"], ctx);
    eq(exit, 1, out);
    assert(/could not be read/.test(out), out);
  });

  test("the report says the template is provisional, and warns before a duplicate run", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const first = await cli(["inventory-import", "--partner=p1", `--csv=${csvFile(fixture())}`,
      "--template=collectr-provisional", "--approve"], ctx);
    assert(/PROVISIONAL — not an authoritative schema/.test(first.out), first.out);
    const second = await cli(["inventory-import", "--partner=p1", `--csv=${csvFile(fixture())}`,
      "--template=collectr-provisional"], ctx);
    assert(/already held/.test(second.out), "a re-run was not warned about: " + second.out);
    assert(/no de-duplication/.test(second.out), second.out);
  });

  test("no row, payload, cert or price of an IMPORTED copy reaches the output", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const { out } = await cli(["inventory-import", "--partner=p1", `--csv=${csvFile(fixture())}`,
      "--template=collectr-provisional", "--approve"], ctx);
    /* The rejected rows are quoted on purpose — that is the report. The ones that
       WORKED are not: a successful import prints counts. */
    assert(!/70551201/.test(out), "a certificate number was printed: " + out);
    assert(!/4200|4,200/.test(out), "an imported price was printed: " + out);
    assert(!/CLR-0001/.test(out), "an imported row's source id was printed: " + out);
  });

  test("the exit code distinguishes clean from 'something did not resolve'", async () => {
    const ctx = await world();
    const made = await stockCatalog(ctx);
    /* A file where every row resolves exits 0. */
    const clean = `Item ID,Card Name,Set Code,Card Number,Language,Edition,Foil,Quantity,`
      + `Grader,Grade,Condition,Cert Number,Listed Price,Purchase Price,Collection\n`
      + `R1,Blastoise,BASE1,2,English,Unlimited,Holo,1,,,NM,,620,505,Shelf\n`;
    const ok = await cli(["inventory-import", "--partner=p1", `--csv=${csvFile(clean, "clean.csv")}`,
      "--template=collectr-provisional"], ctx);
    eq(ok.exit, 0, ok.out);
    const messy = await cli(["inventory-import", "--partner=p1", `--csv=${csvFile(fixture())}`,
      "--template=collectr-provisional"], ctx);
    eq(messy.exit, 3, "a file with unresolved rows exited clean");
    assert(await ctx.catalog.findSelectableCanonicalCard(made.blastoise));
  });
});

/* ============================================== K. WHAT THE REVIEW FOUND
   Every one of these is a defect an adversarial pass found in the first draft of
   this batch, and every one of them was a way for a bad row to reach a shelf
   quietly. They are tests rather than notes because each is a thing the next
   person could undo without noticing. */
describe("K. the ways a bad row used to get in", () => {

  test("a certificate number cannot ride on a card with no grade, or a raw one", () => {
    /* `gradingProblem` never looks at `cert`, so the domain would have taken it.
       A cert is a claim about a slab; on an ungraded card it is a graded card
       whose grade nobody wrote down, which is a worse record than no cert. */
    const noGrade = normalizeOne(mapper(), oneRow({ Grader: "", Grade: "", Condition: "NM",
      "Cert Number": "70551299" }), 2);
    assert(!noGrade.ok, "a cert was written onto an ungraded card");
    eq(noGrade.invalid.reason, INVALID.certWithoutGrade, json(noGrade.invalid));
    const raw = createMapper({ template: TPL.readTemplate("custom-spreadsheet") });
    const onRaw = raw.normalize(["Mudkip", "BASE1", "63", "", "", "", "", "1", "Raw",
      "Near Mint", "99999", "", "", ""],
      ["Card", "Set", "Number", "Language", "Print Run", "Finish", "Stamp", "Qty", "Grade",
        "Condition", "Cert", "Ask", "Cost", "Row"], { at: 2 });
    assert(!onRaw.ok, "a cert was written onto a Raw card");
    eq(onRaw.invalid.reason, INVALID.certWithoutGrade, json(onRaw.invalid));
  });

  test("one certificate number cannot be shared across several copies", () => {
    /* A cert identifies ONE slab. The fixture's line 22 is exactly this, and it
       used to import two PSA 9s both claiming certificate 70551204. */
    const out = normalizeOne(mapper(), oneRow({ Quantity: "2" }), 2);
    assert(!out.ok, "two copies shared one certificate number");
    eq(out.invalid.reason, INVALID.certForMany, json(out.invalid));
    assert(/one slab/.test(out.invalid.detail), out.invalid.detail);
  });

  test("an amount beyond what a number can hold, or a price, is refused", () => {
    const noCert = (v) => oneRow({ "Cert Number": "", Grader: "", Grade: "", Condition: "NM",
      "Listed Price": v });
    /* Past 2^53 the digits come back different from the digits written. */
    for (const written of ["99999999999999999999", "11111111111111111111", "2000000000"]) {
      const out = normalizeOne(mapper(), noCert(written), 2);
      assert(!out.ok, `"${written}" was accepted as money`);
      eq(out.invalid.reason, INVALID.tooLarge, `"${written}": ${json(out.invalid)}`);
    }
    /* More than two decimal places is spreadsheet arithmetic, not a price. */
    for (const written of ["0.0000001", "1150.9999999", "10.005"]) {
      const out = normalizeOne(mapper(), noCert(written), 2);
      assert(!out.ok, `"${written}" was accepted as money`);
      eq(out.invalid.reason, INVALID.tooPrecise, `"${written}": ${json(out.invalid)}`);
    }
    /* And two places still work, because that is what a price is. */
    eq(normalizeOne(mapper(), noCert("1150.99"), 2).record.copy.ask, 1150.99);
  });

  test("one row cannot mean five hundred copies, and one run cannot mean thousands", async () => {
    const big = normalizeOne(mapper(), oneRow({ "Cert Number": "", Grader: "", Grade: "",
      Condition: "NM", Quantity: "50000" }), 2);
    assert(!big.ok, "a quantity of fifty thousand was accepted");
    eq(big.invalid.reason, INVALID.tooMany, json(big.invalid));
    /* And a run of many legal rows is capped too, because `--limit` bounds rows
       read and says nothing about copies. */
    const ctx = await world();
    await stockCatalog(ctx);
    const header = read(FIXTURE).split("\n")[0];
    const row = "R,Blastoise,BASE1,2,English,Unlimited,Holo,400,,,NM,,620,505,Shelf,,,,";
    const many = [header, ...Array.from({ length: 6 }, () => row)].join("\n") + "\n";
    const made = await plan({ csv: many, mapper: mapper(), catalog: ctx.catalog, partnerId: "p1" });
    eq(made.counts.copies, 2400, json(made.counts));
    assert(made.tooMany, "a run of 2,400 copies was not flagged");
    let threw = null;
    try {
      await apply({ plan: made, repository: ctx.repository, runtime: RT.systemRuntime(),
        partnerId: "p1", catalog: ctx.catalog });
    } catch (error) { threw = error; }
    assert(threw, "a run past the cap was applied");
    eq((await shelf(ctx, "p1")).length, 0);
  });

  test("a reported line is the line in the FILE, after a blank row or a wrapped cell", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const header = read(FIXTURE).split("\n")[0];
    /* Line 1 is the header, line 2 is a blank separator, the R1 row starts on
       line 3 and WRAPS onto line 4, so the bad row starts on line 5 — where its
       position among the rows would have said 3. A row is reported by the line it
       STARTS on, which is where a person's cursor lands. */
    const csv = [header, "",
      'R1,"Blastoise\nthe second",BASE1,2,English,Unlimited,Holo,1,,,NM,,620,505,Shelf,,,,',
      "R2,,BASE1,2,English,Unlimited,Holo,1,,,NM,,620,505,Shelf,,,,"].join("\n") + "\n";
    const made = await plan({ csv, mapper: mapper(), catalog: ctx.catalog, partnerId: "p1" });
    const blank = made.rejected.find((r) => r.reason === INVALID.blankIdentity);
    assert(blank, json(made.rejected));
    eq(blank.line, 5, "the reported line is not the line in the file: " + json(made.rejected));
    /* And the wrapped row is reported at its own start, not at its end. */
    eq(made.rejected.find((r) => r.reason === "no-such-card").line, 3, json(made.rejected));
  });

  test("two columns for one field is refused, not resolved by taking the rightmost", async () => {
    const ctx = await world();
    await stockCatalog(ctx);
    const csv = "Card Name,Set Code,Card Number,Condition,Condition\n"
      + "Blastoise,BASE1,2,Near Mint,Damaged\n";
    const columns = mapper().columnsFor(["Card Name", "Set Code", "Card Number",
      "Condition", "Condition"]);
    eq(columns.duplicated.length, 1, json(columns));
    eq(columns.duplicated[0].count, 2);
    const made = await plan({ csv, mapper: mapper(), catalog: ctx.catalog, partnerId: "p1" });
    eq(made.importable.length, 0, "a duplicated column was silently resolved");
    eq(made.rejected[0].reason, INVALID.duplicateColumn, json(made.rejected[0]));
  });

  test("a card withdrawn between the preview and the approval does not import", async () => {
    /* `addInventoryCopy` does not check that a canonical card is still ACTIVE —
       the HTTP route does, by calling `findSelectableCanonicalCard`. So a runner
       that skipped it was strictly weaker than the screen a person uses. */
    const ctx = await world();
    const made = await stockCatalog(ctx);
    const csv = read(FIXTURE).split("\n")[0] + "\n"
      + "R1,Blastoise,BASE1,2,English,Unlimited,Holo,1,,,NM,,620,505,Shelf,,,,\n";
    const preview = await plan({ csv, mapper: mapper(), catalog: ctx.catalog, partnerId: "p1" });
    eq(preview.importable.length, 1, json(preview.rejected));
    await ctx.catalog.withdrawCanonicalCard(made.blastoise);
    const result = await apply({ plan: preview, repository: ctx.repository,
      runtime: RT.systemRuntime(), partnerId: "p1", catalog: ctx.catalog });
    eq(result.written, 0, "a withdrawn card was imported");
    eq(result.refused.reason, "card-unavailable", json(result.refused));
    eq((await shelf(ctx, "p1")).length, 0);
    /* And it is the same answer the screen gives. */
    const byHand = await post(ctx.app, "north", "addInventoryCopy",
      { copy: { canonicalCardId: made.blastoise, condition: "Near Mint" } });
    eq(byHand.json().error.refused, "card-unavailable", byHand.body);
  });

  test("only the domain's own fields reach a copy, whatever a plan is carrying", async () => {
    const ctx = await world();
    const made = await stockCatalog(ctx);
    const csv = read(FIXTURE).split("\n")[0] + "\n"
      + "R1,Blastoise,BASE1,2,English,Unlimited,Holo,1,,,NM,,620,505,Shelf,,,,\n";
    const preview = await plan({ csv, mapper: mapper(), catalog: ctx.catalog, partnerId: "p1" });
    /* A plan is an ordinary mutable object. `addInventoryCopy` spreads whatever
       it is handed, and `updateInventoryCopy` cannot name a field it does not
       know — so anything smuggled here would live on that copy for ever. */
    Object.assign(preview.importable[0].copy, { archived: true, note: "x",
      photos: { front: "http://example.test/x.png" }, partnerId: "p2", invId: "invFAKE" });
    await apply({ plan: preview, repository: ctx.repository, runtime: RT.systemRuntime(),
      partnerId: "p1", catalog: ctx.catalog });
    const rows = await shelf(ctx, "p1");
    eq(rows.length, 1, json(rows));
    for (const key of ["note", "invFAKE"]) {
      assert(!json(rows[0]).includes(key), `"${key}" reached the copy: ${json(rows[0])}`);
    }
    eq(rows[0].archived, false, "a smuggled archived flag was taken");
    eq(rows[0].partnerId, "p1", "a smuggled partner was taken");
    assert(!json(rows[0].photos || {}).includes("example.test"), "a smuggled photo was taken");
    eq((await shelf(ctx, "p2")).length, 0);
  });

  test("a template cannot say 'N/A' and mean a print run", () => {
    /* `not_applicable` is a positive claim about a release, and three spellings
       of "I did not record it" used to import one — while the honest blank cell
       was correctly reported as ambiguous. */
    for (const word of ["N/A", "NA", "Standard", "None", "Unknown", "-"]) {
      const out = normalizeOne(mapper(), oneRow({ Edition: word }), 2);
      assert(!out.ok, `a print run of "${word}" was accepted`);
      eq(out.invalid.reason, INVALID.unknownWord, `"${word}": ${json(out.invalid)}`);
    }
    for (const words of [TPL.PRINT_RUN_WORDS, TPL.FINISH_WORDS, TPL.GRADE_WORDS]) {
      for (const from of Object.keys(words)) {
        assert(!/^(n\/a|na|standard|unknown)$/.test(from),
          `a template still translates "${from}" into a claim`);
      }
    }
  });

  test("a condition scale MetYet does not share is reported, not re-graded", () => {
    /* "Mint" is not Near Mint and "Excellent" is not Lightly Played — they are
       different money. A template that mapped them was guessing in a place
       nobody would look. */
    for (const word of ["Mint", "Excellent", "Good", "Poor", "VG", "Fair"]) {
      const out = normalizeOne(mapper(), oneRow({ Grader: "", Grade: "", "Cert Number": "",
        Condition: word }), 2);
      assert(!out.ok, `a condition of "${word}" was silently re-graded`);
      eq(out.invalid.reason, INVALID.unknownWord, `"${word}": ${json(out.invalid)}`);
    }
  });

  test("a set NAME instead of a code says what MetYet would have needed", async () => {
    /* The likeliest thing a real file gets wrong, and "no such release" alone is
       a true but useless answer when the catalog holds it under that name. */
    const ctx = await world();
    await stockCatalog(ctx);
    const found = await resolveIdentity(ctx.catalog,
      { cardName: "Blastoise", expansion: "Base Set", collectorNumber: "2", dimensions: {} });
    eq(found.outcome, OUTCOME.unresolved);
    eq(found.reason, REASON.noExpansion);
    assert(/BASE1/.test(found.detail), "the reason does not name the code: " + found.detail);
    assert(/by CODE/.test(found.detail), found.detail);
  });

  test("a card context whose key contradicts its own columns is an error, not a dropped candidate", async () => {
    const ctx = await world();
    const made = await stockCatalog(ctx);
    /* Unreachable through `putCardContext`, and reachable for every old row at
       once if the folding rule ever changes. Answering a lying read by hiding it
       could turn a real ambiguity into a confident single match. */
    await ctx.pg.query("update metyet_catalog.card_contexts set natural_key = $1 where card_context_id = $2",
      ["definitely-not-the-key", made.zardContext]);
    let threw = null;
    try {
      await resolveIdentity(ctx.catalog, { cardName: "Charizard", expansion: "BASE1",
        collectorNumber: "4", dimensions: { printRun: "unlimited", finish: "holofoil" } });
    } catch (error) { threw = error; }
    assert(threw, "a contradictory row was silently skipped");
    assert(/natural key/.test(String(threw.message)), String(threw.message));
  });
});

if (require.main === module) run();
