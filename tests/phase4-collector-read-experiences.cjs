/* ============================================================================
   PHASE 4 BATCH 8 — THE COLLECTOR READ EXPERIENCES

   Batch 7 gave the Collector three sections that said what they were and how
   many. This fills them in, and these tests are about the ways a read screen
   starts lying: by attaching a row to the wrong record, by re-deriving a rule
   the server already decided, by turning a relationship network into a
   marketplace, or by showing a figure that was never theirs to see.

   TWO KINDS OF FIXTURE. `REAL` is `projectForActor()` over the demo seed for
   one Collector — the actual output of the actual projection, so the shapes are
   not a memory. Hand-built fixtures carry the adversarial cases, including ones
   the real server could not produce, because the point is that the SCREEN does
   not render them either.

   ONE THING THESE TESTS DELIBERATELY DO NOT ASSERT. The server scopes `goals`,
   `binder` and `interests` to one Collector before sending them. A browser that
   re-filtered by `collectorId` would be re-implementing that rule — which this
   architecture refuses, and which would MASK a server bug rather than surface
   it. So what is proved here is the part the browser owns: every join is by an
   explicit id, a missing related row yields nothing rather than a neighbour,
   and no identity can be replaced.

     A  Goals, and the one place coordination appears
     B  Your Cards (the Trade Binder until C2)
     C  Trusted Partners
     D  joins: explicit ids, and what happens when one is missing
     E  privacy: TP-private fields and cross-Collector identity
     F  nothing acts, nothing mutates, nothing is imported
     G  the Trusted Partner and the demo are untouched
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const React = require("react");
const TR = require("react-test-renderer");

const ROOT = path.join(__dirname, "..");
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (rel) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

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

const SHELL_MOD = load("client/collector/CollectorShell.jsx");
const CollectorShell = SHELL_MOD.default;
const PRESENT = load("client/collector/present.js");
const ProductionApp = load("client/production-app.jsx").default;

const COLLECTOR_FILES = fs.readdirSync(path.join(ROOT, "client", "collector"), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory()
    ? fs.readdirSync(path.join(ROOT, "client", "collector", e.name)).map((f) => `client/collector/${e.name}/${f}`)
    : [`client/collector/${e.name}`]));

const ME = "c-8x21";
const P1 = "p-north";
const P2 = "p-second";
/* C1 put Browse at the front: it is where a Collector finds a card, and
   saying "I am looking for this" now happens while browsing. */
/* RESTATED IN C3.4, twice in one batch. Your Cards was built in C2 and deferred
   through four batches; C3.4a fixed its canonical naming and moved it into the
   product. C3.4b added Binder and took GOALS OUT — not because a Goal stopped
   mattering, but because a binder expresses coherence and a Goal expresses
   priority, and those are two things to know about one card rather than two
   places to go. A Goal is still an independent durable fact, set and changed
   from the Card Specification panel, and read where the card is; the Goals with
   no active binder are listed inside Binder so that losing the tab hides none
   of them.

   The list is the product's own order and words, and it is stated here once so
   every assertion below reads the same one. */
const NAV = ["Browse", "Binder", "Your Cards", "Trusted Partners"];

/* ---------------------------------------------------- the real projection */

const REAL = (() => {
  const out = esbuild.buildSync({
    entryPoints: [path.join(ROOT, "src", "MetYet.jsx")],
    bundle: true, format: "cjs", write: false, logLevel: "silent", jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
  });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  const { projectForActor } = require(path.join(ROOT, "domain", "metyet-projection.js"));
  return projectForActor(mod.exports.buildCanonicalSeed(), { collectorId: "c12" });
})();
const REAL_PRISTINE = JSON.stringify(REAL);

/* --------------------------------------------------------- hand fixtures */

const EMPTY = Object.freeze({
  actor: { seat: "collector", collectorId: ME },
  collectors: [{ id: ME, name: "Casey Lin", city: "Brooklyn, NY" }],
  partners: [], relationships: [], invitations: [], goals: [], preferences: [],
  inventory: [], collectorCopies: [], binders: [], binderEntries: [], interests: [], opportunities: [], conversations: [],
  activity: [], photoRequests: [], copyReviews: [], counterparties: [], catalog: [],
});

/* A PROJECTED ROW CARRIES ITS GRADING READING (Phase 5 C3.3). The projection
   computes `grading` from the domain's own `gradingRead` for every row that has
   a grade or a condition — copies and the legacy catalogue alike — and the
   presenters read it instead of parsing the string themselves. A fixture that
   left it out would not be a projection, so these are built the way the server
   builds them, with the domain's own function rather than a copy of it. */
const D = require("../domain/metyet-domain.js");
const projected = (row) => ({ ...row, grading: D.gradingRead(row) });

const CATALOG = [
  { id: "k1", name: "Rayquaza Gold Star", set: "EX Deoxys", num: "107/107", year: 2005,
    grade: "PSA 9", edition: "Unlimited", print: "Holo", language: "English" },
  { id: "k2", name: "Blastoise", set: "Base Set", num: "2/102", year: 1999, grade: "PSA 8" },
  { id: "k3", name: "Umbreon", set: "Neo Discovery", num: "13/75", grade: "Raw", condition: "Near Mint" },
].map(projected);

const FULL = Object.freeze({
  ...EMPTY,
  catalog: CATALOG,
  goals: [
    { id: "g-ray", collectorId: ME, cardId: "k1", tier: "primary", note: "RAYQUAZA-NOTE",
      since: "2026-03-02", confirmedAt: "2026-04-21" },
    { id: "g-blast", collectorId: ME, cardId: "k2", tier: "secondary", note: "BLASTOISE-NOTE",
      since: "2026-01-05" },
  ],
  /* GRADE AND CONDITION ARE THE COPY'S (Batch 5), so these rows carry their
     own — and deliberately NOT the same answer as the catalogue card they name,
     which is what lets the test below prove which of the two the screen reads.
     `b-umb` is a raw Near Mint copy of a card the catalogue also calls raw;
     `b-blast` is a PSA 7 copy of a card the catalogue calls PSA 8, because two
     copies of one printing at different grades are exactly the case the
     canonical model exists to represent. */
  collectorCopies: [
    { offered: true, id: "b-umb", collectorId: ME, cardId: "k3", market: 2050, cert: "PSA 63118845",
      grade: "Raw", condition: "Near Mint",
      addedAt: "2025-10-10", status: "available", photos: { front: "binder:k3:front", back: "binder:k3:back" } },
    { offered: true, id: "b-blast", collectorId: ME, cardId: "k2", market: 900, cert: "PSA 71204885",
      grade: "PSA 7",
      addedAt: "2025-04-01", status: "traded", photos: { front: "binder:k2:front" } },
  ].map(projected),
  interests: [{ partnerId: P2, binderId: "b-umb", at: "2025-10-10" }],
  partners: [
    { id: P1, name: "Northline Cards", city: "Duluth, Minnesota", about: "NORTHLINE-ABOUT",
      specialties: ["Vintage", "PSA"], website: "northline.example", email: "hello@northline.example" },
    { id: P2, name: "Second Shop", city: "Leeds" },
  ],
  relationships: [
    { partnerId: P2, collectorId: ME, status: "accepted", at: "2024-02-02" },
    { partnerId: P1, collectorId: ME, status: "accepted", at: "2025-09-03" },
  ],
  opportunities: [
    { id: "o-ray", collectorId: ME, goalId: "g-ray", partnerId: P1, cardId: "k1",
      stage: "select-trade", listedPrice: 9800, agreedPrice: 9310, updated: "2026-04-14" },
  ],
});

/* ------------------------------------------------------------- rendering */

const render = (element) => {
  let r;
  TR.act(() => { r = TR.create(element); });
  return r;
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
  return out.join(" ");
};
const flat = (r) => texts(r).replace(/\s+/g, " ");
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
const buttons = (r) => r.root.findAll((n) => n.type === "button");
const clickText = (r, label) => {
  const b = buttons(r).find((n) => instText(n).includes(label));
  assert(b, `no button "${label}" among: ${buttons(r).map(instText).join(" | ")}`);
  TR.act(() => { b.props.onClick(); });
};
/* RESTATED IN BATCH 8.1, AND AGAIN IN C2 (renamed Your Cards). It left the Collector's navigation:
   its only writer needs a legacy catalogue row, production has none, so every
   Collector had a tab that opened onto something that could never fill. The
   section itself is untouched and still ships, so the assertions about what it
   renders are untouched too — they render it the way the shell would, with the
   same single `state` prop, instead of pressing a button that is no longer
   there. Section C separately proves it cannot be reached. */
const DEFERRED = SHELL_MOD.DEFERRED_SECTIONS || [];
const show = (state, section = null) => {
  const deferred = DEFERRED.find((s) => s.label === section);
  if (deferred) return render(React.createElement(deferred.view, { state }));
  const r = render(React.createElement(CollectorShell, { state }));
  if (section) clickText(r, section);
  return r;
};
/* THE SECTION'S OWN TEXT, without the shell around it (C1). The navigation is
   on screen in every section, so an assertion about what a SECTION says has to
   be made of the section — otherwise a nav label is read as the section's own
   words, which is how "Browse" became marketplace framing on the Trusted
   Partners screen. */
const sectionText = (r) => {
  const main = r.root.findAll((n) => n.type === "main")[0];
  return main ? instText(main).replace(/\s+/g, " ") : "";
};

/* The rendered text of ONE record block, found by something inside it. */
const recordWith = (r, needle) => {
  const a = r.root.findAll((n) => n.type === "article").find((n) => instText(n).includes(needle));
  assert(a, `no record containing "${needle}" — screen: ` + flat(r));
  return instText(a).replace(/\s+/g, " ");
};
const records = (r) => r.root.findAll((n) => n.type === "article")
  .map((n) => instText(n).replace(/\s+/g, " "));

/* Visit EVERY section and assert on each. The obvious loop — read the screen,
   then click to the next section — checks the first section twice and the LAST
   ONE NEVER, because the final click happens after the final assertion. A break
   injection that leaked a Trusted Partner's private note walked straight
   through that gap. Navigating FIRST is what closes it. */
const onEverySection = (r, check) => {
  for (const s of NAV) {
    clickText(r, s);
    check(flat(r), s);
  }
};

/* ============================================================== A */
describe("A. Goals — and the one place coordination appears", () => {
  test("an empty Goals section is a sentence, not a failure and not a control", () => {
    const shown = flat(show(EMPTY, "Goals"));
    assert(/haven't set any goals yet/.test(shown), shown);
    assert(/how your Trusted Partners know what to look out for/.test(shown),
      "it does not say what a goal is for: " + shown);
    assert(!/add|create|new goal|\+/i.test(shown.replace(/Read-only[^.]*\./, "")),
      "an unbuilt action is implied: " + shown);
    assert(!/error|failed|unavailable|try again/i.test(shown), "empty reads as broken: " + shown);
  });

  test("several goals render, each from its own projected row", () => {
    const r = show(FULL, "Goals");
    const ray = recordWith(r, "Rayquaza Gold Star");
    const blast = recordWith(r, "Blastoise");
    assert(ray.includes("RAYQUAZA-NOTE") && !ray.includes("BLASTOISE-NOTE"), "notes crossed: " + ray);
    assert(blast.includes("BLASTOISE-NOTE") && !blast.includes("RAYQUAZA-NOTE"), blast);
    /* The row says what the tier MEANS since Batch 7 — "Primary" is the
       domain's name for it, not a sentence a person reads. The distinction is
       what is asserted, and it is asserted in both directions. */
    assert(/Actively hunting/.test(ray) && !/Keeping an eye out/.test(ray),
      "the primary goal does not read as active hunting: " + ray);
    assert(/Keeping an eye out/.test(blast) && !/Actively hunting/.test(blast),
      "the secondary goal does not read as passive: " + blast);
    assert(ray.includes("EX Deoxys") && ray.includes("107/107") && ray.includes("PSA 9"),
      "the card identity for its own cardId: " + ray);
    assert(ray.includes("2026-03-02"), "wanted since: " + ray);
  });

  test("two goals for the SAME card stay two goals", () => {
    /* Identity is the goal's own id, not the card it names. */
    const twins = { ...FULL, goals: [
      { id: "g-a", collectorId: ME, cardId: "k1", tier: "primary", note: "FIRST-NOTE", since: "2026-01-01" },
      { id: "g-b", collectorId: ME, cardId: "k1", tier: "secondary", note: "SECOND-NOTE", since: "2026-02-02" },
    ] };
    const r = show(twins, "Goals");
    const all = records(r);
    eq(all.length, 2, "two goals for one card collapsed into " + all.length);
    assert(all.some((t) => t.includes("FIRST-NOTE")) && all.some((t) => t.includes("SECOND-NOTE")),
      "both goals' own notes: " + all.join(" | "));
  });

  test("coordination attaches by goalId, and to no other goal", () => {
    const r = show(FULL, "Goals");
    const ray = recordWith(r, "RAYQUAZA-NOTE");
    const blast = recordWith(r, "BLASTOISE-NOTE");
    assert(ray.includes("Choosing what to trade"), "the server's stage, in the product's words: " + ray);
    assert(ray.includes("Northline Cards"), "and who it is with, by partnerId: " + ray);
    assert(ray.includes("$9,800") && ray.includes("$9,310"), "the prices the server stated: " + ray);
    assert(!blast.includes("Choosing what to trade") && !blast.includes("$9,800"),
      "the other goal's deal attached here: " + blast);
  });

  test("an opportunity naming a goal that is not there attaches to nothing", () => {
    const orphan = { ...FULL, opportunities: [
      { id: "o-x", collectorId: ME, goalId: "g-does-not-exist", partnerId: P1, cardId: "k1",
        stage: "deal", listedPrice: 1234, updated: "2026-05-05" },
    ] };
    const shown = flat(show(orphan, "Goals"));
    assert(!shown.includes("$1,234"), "an orphan deal was attached to a goal: " + shown);
    assert(!/Agreeing the deal/.test(shown), "and its stage rendered: " + shown);
  });

  test("an opportunity with no goalId attaches to nothing", () => {
    const loose = { ...FULL, opportunities: [
      { id: "o-l", collectorId: ME, goalId: null, partnerId: P1, cardId: "k1",
        stage: "deal", listedPrice: 4321, updated: "2026-05-05" },
    ] };
    assert(!flat(show(loose)).includes("$4,321"), "a deal with no goal was attached to one");
  });

  test("an unfamiliar stage survives as itself and is marked", () => {
    const odd = { ...FULL, opportunities: [
      { id: "o-e", collectorId: ME, goalId: "g-ray", partnerId: P1, stage: "escrow-hold",
        updated: "2026-06-06" }] };
    const shown = flat(show(odd, "Goals"));
    assert(shown.includes("escrow-hold"), "the stage vanished: " + shown);
    assert(/not a step this version knows/.test(shown), "and was passed off as familiar: " + shown);
    assert(!/Agreeing a price|Choosing what to trade|Valuing|Handing it over/.test(shown),
      "it was coerced: " + shown);
    eq(PRESENT.stageLabel("escrow-hold"), "escrow-hold");
    eq(PRESENT.isKnownStage("escrow-hold"), false);
  });

  test("no lifecycle is reconstructed — only what the row says is read", () => {
    const bare = COLLECTOR_FILES.map(code).join("\n");
    assert(!/priceThread|\.trade\b|\.deal\b|\.fulfillment\b|isNegotiating|turnFor|nextActor/.test(bare),
      "the shell opens the negotiation structures the server sent");
    assert(!/stage\s*===|stage\s*!==|STAGE_IX/.test(bare), "the shell compares stages");
  });

  test("there is no Collector Opportunities product", () => {
    const r = show(FULL);
    const labels = buttons(r).map(instText);
    eq(labels.filter((l) => NAV.some((n) => l.includes(n))).length, NAV.length,
      "a section appeared that the product does not offer");
    onEverySection(r, (shown) =>
      assert(!/opportunit/i.test(shown), "the word appears as a product: " + shown));
    eq(SHELL_MOD.SECTIONS.map((x) => x.id).join(","), "browse,binder,my-cards,partners");
    /* Restated in Batch 8.1, renamed in C2: Your Cards is declared deferred rather
       than offered, and "no Opportunities product" is unaffected by it. */
    /* RESTATED IN C3.4: Your Cards moved into the product and Goals moved out
       of it. Goals is DEFERRED rather than deleted — the screen is kept, and a
       Goal is still set and changed from Card Specification and read where the
       card is; what went is the destination. */
    eq(SHELL_MOD.DEFERRED_SECTIONS.map((x) => x.id).join(","), "goals");
  });
});

/* ============================================================== B */
describe("B. Your Cards", () => {
  test("an empty shelf is a sentence, and offers nothing unbuilt", () => {
    const shown = flat(show(EMPTY, "Your Cards"));
    assert(/haven't recorded any cards yet/.test(shown), shown);
    /* RESTATED IN C2. It used to require the sentence to say what the binder was
       FOR — "what you can offer in a trade" — because owning and offering were
       the same act. They are two acts now, so the empty state has to say both:
       a card here is one you own, and offering it is a separate choice. That is
       a stricter requirement than the old one, not a looser one. */
    assert(/a card here is one you own/i.test(shown), "it does not say what a card here is");
    assert(/offering one is a separate choice/i.test(shown), "it does not say offering is separate");
    assert(!/error|failed|unavailable/i.test(shown), "empty reads as broken: " + shown);
  });

  test("each copy renders from its own row, with its own cert and value", () => {
    const r = show(FULL, "Your Cards");
    const umb = recordWith(r, "Umbreon");
    const blast = recordWith(r, "Blastoise");
    assert(umb.includes("PSA 63118845") && !umb.includes("PSA 71204885"), "certs crossed: " + umb);
    assert(umb.includes("$2,050") && !umb.includes("$900"), "reference values crossed: " + umb);
    assert(blast.includes("PSA 71204885") && blast.includes("$900"), blast);
    /* SUPERSEDED AND RESTATED (Phase 5 C3.3).
       What this protected: that a copy's raw-versus-graded state is shown as
       stated and not inferred.
       Why "the catalogue's answer" is no longer correct: Batch 5 moved grade
       and condition off card identity and onto the copy, and C2 gave a copy a
       canonical card — which has no catalogue row here at all, so reading
       grading from the catalogue showed a canonical copy nothing.
       What replaces it, and why it is stricter: the copy and the card it names
       are given DIFFERENT grades, and the screen must show the copy's. The old
       form could not tell the two apart, because the fixture's copies had no
       grading of their own. */
    assert(umb.includes("Raw · Near Mint"), "the copy's own grading: " + umb);
    assert(blast.includes("PSA 7") && !blast.includes("PSA 8"),
      "the card's grade was shown where the copy's belongs: " + blast);
    assert(umb.includes("Front and back") && blast.includes("Front only"),
      "photos are described, not shown: " + umb + " | " + blast);
  });

  test("status is the server's answer, not one worked out here", () => {
    /* `b-blast` is TRADED while no opportunity in the projection references it.
       A client that re-derived the rule would call it available. */
    const r = show(FULL, "Your Cards");
    assert(recordWith(r, "PSA 71204885").includes("Traded"), "the server's status was overruled");
    const bare = COLLECTOR_FILES.map(code).join("\n");
    assert(/copy\.status/.test(bare), "the status is read from the row");
    assert(!/collectorCopyStatus|binderRowState|inclusion|withdrawn/.test(bare),
      "the shell re-derives a canonical rule");
  });

  test("an unfamiliar status survives as itself", () => {
    const odd = { ...FULL, collectorCopies: [{ offered: true, id: "b-x", collectorId: ME, cardId: "k3", status: "impounded" }] };
    const shown = flat(show(odd, "Your Cards"));
    assert(shown.includes("impounded"), "the status vanished: " + shown);
    assert(!/Available|Reserved|Committed|Traded/.test(shown), "it was rounded: " + shown);
  });

  test("interest attaches by binderId, and names no partner it cannot", () => {
    const r = show(FULL, "Your Cards");
    const umb = recordWith(r, "PSA 63118845");
    assert(umb.includes("Second Shop"), "the interested partner, by partnerId: " + umb);
    const blast = recordWith(r, "PSA 71204885");
    assert(!blast.includes("Second Shop") && !/Interested/.test(blast),
      "interest attached to the wrong copy: " + blast);
  });

  /* SUPERSEDED AND RESTATED (Phase 5 C3.4).

     What this protected, in two halves: that the Collector's read surfaces run
     no card search of their own, and that they show no imagery — because at the
     time there was no image the product could honestly show. A Collector's
     `photos` are REFERENCES like `binder:t15:front`, not URLs, and rendering
     one would have produced a broken image where a fact should be.

     Why the second half is no longer correct: C1 gave the catalog real artwork
     and C3.4 shows it. `describe(ids)` returns `imageSmall`, which is the
     CATALOGUE's picture of a card — a different thing from a photograph of
     somebody's copy, and the only kind of image this surface may show.

     What replaces it, and why it is stricter: the search half is unchanged, and
     the imagery half now says the thing that actually matters — a Collector's
     own `photos` are still never rendered as an image anywhere, and are still
     described in words. The old form could only forbid the tag; this forbids
     the mistake. */
  test("no card search of its own, and a Collector's own photos are never shown", () => {
    const bare = COLLECTOR_FILES.map(code).join("\n");
    assert(!/searchCards|catalogSearch|pokemon/i.test(bare),
      "a catalogue search appeared");
    /* Every `src` on this surface comes from a catalogue description. */
    const sources = bare.match(/src=\{[^}]*\}/g) || [];
    sources.forEach((src) => assert(/image[A-Z]/.test(src),
      `an image is sourced from something other than a catalogue description: ${src}`));
    /* And a copy's own photographs are still words, never a picture. */
    assert(!/src=\{[^}]*photos/.test(bare), "a Collector's own photo was rendered as an image");
    assert(/photoNote/.test(bare), "photographs stopped being described in words");
  });
});

/* ============================================================== C */
describe("C. Trusted Partners", () => {
  test("an empty list is a sentence about relationships, not a marketplace", () => {
    const r = show(EMPTY, "Trusted Partners");
    const shown = flat(r);
    assert(/no Trusted Partners yet/.test(shown), shown);
    assert(/A shop invites you/.test(shown), "it does not say how a relationship starts");
    /* Restated in C1: the SECTION's own words, not the navigation's. Browse is
       a place to find a card, and it is not on this screen. */
    assert(!/browse|find a shop|search|marketplace|discover|join now/i.test(sectionText(r)),
      "marketplace framing: " + sectionText(r));
  });

  test("each partner renders with their own profile and their own relationship", () => {
    const r = show(FULL, "Trusted Partners");
    const north = recordWith(r, "Northline Cards");
    const second = recordWith(r, "Second Shop");
    assert(north.includes("Duluth, Minnesota") && north.includes("NORTHLINE-ABOUT"), north);
    assert(north.includes("Vintage") && north.includes("PSA"), "specialties: " + north);
    assert(north.includes("hello@northline.example"), "contact: " + north);
    /* The relationships are in the OPPOSITE order to the partners. */
    assert(north.includes("2025-09-03") && !north.includes("2024-02-02"),
      "relationships attached by position, not partnerId: " + north);
    assert(second.includes("2024-02-02") && !second.includes("2025-09-03"), second);
  });

  test("a partner with no relationship row gets no invented one", () => {
    const state = { ...FULL, relationships: [{ partnerId: P1, collectorId: ME, status: "accepted", at: "2025-09-03" }] };
    const r = show(state, "Trusted Partners");
    const second = recordWith(r, "Second Shop");
    assert(!second.includes("2025-09-03"), "the other partner's date was borrowed: " + second);
    assert(!/Partners since/.test(second), "a since line was drawn with nothing in it: " + second);
  });

  test("no invitation, acceptance or relationship control exists", () => {
    const r = show(FULL, "Trusted Partners");
    const labels = buttons(r).map(instText);
    eq(labels.length, NAV.length + 1, "an extra control appeared: " + labels.join(" | "));
    /* CONTROLS are what this forbids. "accepted" is the relationship STATUS the
       server sent, rendered as a tag — banning the substring flagged the
       projection's own word, which is data. So: no control carries an action
       verb, and no copy offers an action in the imperative. */
    labels.forEach((l) => assert(!/accept|decline|invite|leave|remove|connect|end/i.test(l),
      `a control offers a relationship action: "${l}"`));
    assert(!/\b(accept|decline|invite|leave|remove|connect) (this|a|an|your|the)\b|invitation to accept/i.test(flat(r)),
      "an unbuilt relationship action is offered: " + flat(r));
  });

  test("a partner's stock is not rendered — this is a network, not a shop window", () => {
    const withStock = { ...FULL, inventory: [
      { invId: "i1", partnerId: P1, cardId: "k1", ask: 4200, status: "available", cert: "STOCK-CERT" }] };
    for (const section of ["Trusted Partners", "Goals", "Browse"]) {
      const shown = flat(show(withStock, section));
      assert(!shown.includes("STOCK-CERT") && !shown.includes("$4,200") && !shown.includes("4200"),
        `a partner's inventory was rendered in ${section}: ` + shown);
    }
    /* RESTATED IN C1, AND IT IS A NARROWER RULE THAN IT WAS, not a wider one.
       It used to say the Collector surface must not read `inventory` at all —
       a blanket ban that stood in for the real rule while nothing needed the
       collection. Browse now needs one thing from it: HOW MANY of a
       Collector's Trusted Partners have the card they are looking at. That is
       a count of people, from rows the server already decided they may see,
       and it is the opposite of a shop window — it names no partner, no price,
       no certificate and no copy.

       So the rule is stated as what it always meant: a copy's own facts never
       reach a Collector's screen. The field names below are the whole of what
       a shop window would be made of, and none of them is read anywhere under
       `client/collector/`. */
    const bare = COLLECTOR_FILES.map(code).join("\n");
    /* The fields that only ever belong to a TRUSTED PARTNER'S copy. `cert`,
       `photos` and `market` are deliberately not on this list: those are facts
       about a Collector's OWN binder copy, which their own screen may show and
       always could. */
    for (const field of ["ask", "cost", "acquired", "invId"]) {
      assert(!new RegExp(`\\.${field}\\b|\\["${field}"\\]`).test(bare),
        `the Collector surface reads a copy's ${field}`);
    }
    /* And inventory is counted, never listed: no screen turns those rows into
       anything a person reads one by one. */
    assert(!/inventory\)[\s.]*\.?(map|forEach|slice)|inventory\.map/.test(bare),
      "the Collector surface renders inventory rows");
  });
});

/* ============================================================== D */
describe("D. joins are by explicit id, and a missing one yields nothing", () => {
  test("a goal whose card is not in the catalogue still renders, and borrows none", () => {
    const state = { ...FULL, goals: [
      { id: "g-x", collectorId: ME, cardId: "not-in-catalogue", tier: "primary", note: "ORPHAN-NOTE" }] };
    const r = show(state, "Goals");
    const rec = recordWith(r, "ORPHAN-NOTE");
    assert(/isn't in your catalogue/.test(rec), "the orphan goal vanished: " + rec);
    CATALOG.forEach((c) => assert(!rec.includes(c.name), `it borrowed "${c.name}": ` + rec));
  });

  test("a binder copy whose card is missing renders without borrowing one", () => {
    const state = { ...FULL, collectorCopies: [
      { offered: true, id: "b-x", collectorId: ME, cardId: "nope", cert: "LONE-CERT", status: "available" }] };
    const rec = recordWith(show(state, "Your Cards"), "LONE-CERT");
    CATALOG.forEach((c) => assert(!rec.includes(c.name), `it borrowed "${c.name}": ` + rec));
  });

  test("an interest naming a partner who is not there names nobody", () => {
    const state = { ...FULL, interests: [{ partnerId: "p-stranger", binderId: "b-umb", at: "2025-01-01" }] };
    const rec = recordWith(show(state, "Your Cards"), "PSA 63118845");
    assert(!rec.includes("Northline Cards") && !rec.includes("Second Shop"),
      "the first partner was substituted: " + rec);
    assert(!/Interested/.test(rec), "an interest line was drawn with nobody in it: " + rec);
  });

  test("an opportunity naming a partner who is not there still shows its stage", () => {
    const state = { ...FULL, opportunities: [
      { id: "o-s", collectorId: ME, goalId: "g-ray", partnerId: "p-stranger",
        stage: "deal", updated: "2026-07-07" }] };
    const rec = recordWith(show(state, "Goals"), "RAYQUAZA-NOTE");
    assert(rec.includes("Agreeing the deal"), "the stage was lost with the partner: " + rec);
    assert(!rec.includes("Northline Cards") && !rec.includes("Second Shop"),
      "a partner name was substituted: " + rec);
  });

  test("names and emails are never used as keys", () => {
    const bare = COLLECTOR_FILES.map(code).join("\n");
    assert(!/\.find\([^)]*\.name\s*===|\.find\([^)]*email|get\(\s*[a-z]*\.name\s*\)/i.test(bare),
      "a name or email is used as a lookup key");
    /* Every Map this surface builds is keyed on an id. */
    const keyed = bare.match(/\.set\(([^,]+),/g) || [];
    keyed.forEach((k) => assert(/[Ii]d|\bp\.id\b|\bid\b/.test(k), `a map is keyed on something else: ${k}`));
  });

  test("ragged rows do not take any section down", () => {
    const ragged = { ...EMPTY,
      catalog: [null, { id: null, name: "Nameless" }],
      goals: [null, {}, { id: "g" }],
      collectorCopies: "not an array",
      interests: [null, {}],
      partners: [null, { id: "p" }],
      relationships: [null, {}],
      opportunities: [null, { id: "o", goalId: "g" }] };
    const r = show(ragged);
    for (const s of NAV) { clickText(r, s); assert(flat(r).length > 0, `${s} rendered nothing`); }
    assert(!/\[object Object\]|undefined|NaN/.test(flat(r)), "something leaked: " + flat(r));
  });

  test("the whole real projection renders in every section", () => {
    const r = show(REAL);
    assert(flat(r).includes("Casey Lin"));
    for (const s of NAV) { clickText(r, s); assert(flat(r).length > 0, `${s} rendered nothing`); }
    assert(!/\[object Object\]|undefined|NaN/.test(flat(r)), "something leaked");
    assert(flat(r).includes("Northline Cards"), "the real partners: " + flat(r).slice(0, 200));
  });
});

/* ============================================================== E */
describe("E. privacy — TP-private fields and Collector identity", () => {
  test("the real projection carries none of the TP-private fields", () => {
    assert(REAL.inventory.length > 0, "the fixture has no inventory; the test is toothless");
    assert(!REAL.inventory.some((i) => "cost" in i || "acquired" in i),
      "a Collector received a Trusted Partner's acquisition figures");
    assert(!REAL.relationships.some((r) => "note" in r || "last" in r || "binderReviewedAt" in r),
      "a Collector received a Trusted Partner's private relationship notes");
    eq(REAL.activity.length, 0, "a Collector received partner-private activity");
  });

  test("and no section renders them even when they arrive", () => {
    const leaky = { ...FULL,
      inventory: [{ invId: "i1", partnerId: P1, cardId: "k1", ask: 4200, cost: 3100,
        acquired: "2026-01-11", status: "available" }],
      relationships: [{ partnerId: P1, collectorId: ME, status: "accepted", at: "2025-09-03",
        note: "TP-PRIVATE-NOTE", last: "2026-08-05", binderReviewedAt: "2026-07-30" }],
      activity: [{ id: "a1", partnerId: P1, text: "TP-PRIVATE-ACTIVITY" }],
      goals: FULL.goals.map((g) => ({ ...g })) };
    const r = show(leaky);
    onEverySection(r, (shown, s) => {
      ["3100", "$3,100", "2026-01-11", "TP-PRIVATE-NOTE", "TP-PRIVATE-ACTIVITY", "2026-08-05", "2026-07-30"]
        .forEach((secret) => assert(!shown.includes(secret), `"${secret}" reached the screen in ${s}: ` + shown));
    });
    const bare = COLLECTOR_FILES.map(code).join("\n");
    ["cost", "acquired", "binderReviewedAt", "activity", "tradeRate"].forEach((field) =>
      assert(!new RegExp(`\\b${field}\\b`).test(bare), `the Collector surface reads "${field}"`));
  });

  test("another Collector's identity cannot become this one's, by any route", () => {
    const crossed = { ...FULL,
      collectors: [{ id: "c-other", name: "OTHER COLLECTOR" }, { id: ME, name: "Casey Lin" }] };
    const r = render(React.createElement(CollectorShell, { state: crossed,
      collectorId: "c-other", name: "OTHER COLLECTOR", email: "other@example.com" }));
    const shown = flat(r);
    assert(shown.includes("Casey Lin"), "the projection's own actor was replaced: " + shown);
    ["OTHER COLLECTOR", "c-other", "other@example.com"].forEach((s) =>
      assert(!shown.includes(s), `"${s}" reached the screen: ` + shown));
  });

  test("no internal id is ever a label", () => {
    const r = show(REAL);
    onEverySection(r, (shown, s) => {
      ["c12", "p-self", "cc16", "g20", "i17", "inv1"].forEach((id) =>
        assert(!shown.includes(id), `the raw id "${id}" is on screen in ${s}: ` + shown));
    });
  });
});

/* ============================================================== F */
describe("F. nothing acts, nothing mutates, nothing forbidden is imported", () => {
  test("the projection handed in is never edited, by any section", () => {
    const r = show(REAL);
    for (const s of NAV) clickText(r, s);
    eq(JSON.stringify(REAL), REAL_PRISTINE, "a section mutated the projection it was given");
  });

  test("the only controls are the sections, sign out, and what Goals was given", () => {
    /* RESTATED IN BATCH 7. This render is handed NO callbacks, and with none
       there is nothing to press but navigation — which is the property that
       matters and is what is asserted. A surface that offered a control it
       could not deliver would fail here first. */
    /* RESTATED IN C1. Browse has controls of its own — three doorways and a
       search — so "nothing to press but navigation" is asserted of the sections
       that offer nothing, and Browse's own controls are named rather than
       counted away. The property is unchanged: a section handed no callbacks
       offers no way to change anything. */
    /* RESTATED IN C3.4b: the sections that offer nothing of their own are now
       Trusted Partners alone — Binder offers creating and managing binders, and
       Your Cards offers a filter, both of which are controls this surface
       deliberately has. Goals is asserted separately below, rendered the way
       the shell would render it, because it is deferred rather than gone. */
    const r = show(FULL);
    for (const s of ["Trusted Partners"]) {
      clickText(r, s);
      eq(buttons(r).map(instText).length, NAV.length + 1, "an extra control appeared in " + s);
    }
    /* A deferred Goals, handed no callbacks, still offers nothing to press. */
    eq(buttons(show(FULL, "Goals")).length, 0, "a deferred section offered a control");
    clickText(r, "Browse");
    const browsing = buttons(r).map(instText).map((l) => l.trim());
    /* A nav button carries its count ("2 Goals"), so it is matched by the label
       it contains rather than by equality. */
    const own = browsing.filter((l) => !NAV.some((n) => l.includes(n)) && l !== "Sign out");
    eq(own.join(","), "Pokémon,Set,Artist", "Browse grew a control: " + own.join(" | "));
    const bare = COLLECTOR_FILES.map(code).join("\n");
    /* Binder entries, interests and invitations are still nobody's to write
       from here; each moves with its own batch. */
    assert(!/execute\s*\(|\.command\s*\(/.test(bare), "a mutation path appeared");
    assert(!/addCollectorCopy|setInterest|inviteCollector/.test(bare),
      "a surface grew a write that belongs to a later batch");
  });

  test("nothing under client/collector reaches a store, a domain, a network or the demo", () => {
    assert(COLLECTOR_FILES.length >= 6, "the file list is wrong: " + COLLECTOR_FILES.join(","));
    for (const rel of COLLECTOR_FILES) {
      const bare = code(rel);
      assert(!/from ["'][^"']*domain\/|require\(["'][^"']*domain\//.test(bare), `${rel} imports domain`);
      assert(!/projectForActor|buildCanonicalSeed|createStore|prototypeRuntime|systemRuntime|metyet-commands/.test(bare),
        `${rel} projects, seeds or runs a runtime`);
      assert(!/\bfetch\s*\(|XMLHttpRequest|EventSource|WebSocket/.test(bare), `${rel} reaches the network`);
      assert(!/store\.|session\.|api\.|createApiClient|createProductionStore/.test(bare),
        `${rel} holds a store, a session or an api client`);
      assert(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(bare), `${rel} persists something`);
      assert(!/MetYetPrototype|MetYetCollector|demo-flag|dev-flag|src\/MetYet|shell\//.test(bare),
        `${rel} reaches the demo or the prototype`);
      assert(!/client\/tp|TrustedPartnerShell/.test(bare), `${rel} reaches the TP workspace`);
    }
  });

  test("the production bundle still carries no seed, persona or domain", () => {
    const bundle = esbuild.buildSync({
      entryPoints: [path.join(ROOT, "app-src", "main.jsx")],
      bundle: true, format: "esm", write: false, logLevel: "silent", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"', __METYET_DEV__: "false", __METYET_DEMO__: "false",
        __METYET_API_URL__: '""', __METYET_SUPABASE_URL__: '""', __METYET_SUPABASE_KEY__: '""' },
    }).outputFiles[0].text;
    ["buildCanonicalSeed", "prototypeRuntime", "projectForActor", "metyet-commands", "CARDS_SEED",
      "Switch persona", "Reset demo", "MetYetPrototype", "Casey Lin", "Sarah Mendel", "p-self"]
      .forEach((n) => assert(!bundle.includes(n), `the production bundle contains "${n}"`));
  });
});

/* ============================================================== G */
describe("G. the Trusted Partner and the demo are untouched", () => {
  test("a Trusted Partner still gets their workspace, and their own cost", () => {
    const tp = { actor: { seat: "tp", partnerId: P1 },
      partners: [{ id: P1, name: "Northline Cards" }],
      collectors: [{ id: ME, name: "Casey Lin", city: "Brooklyn, NY" }],
      relationships: [{ partnerId: P1, collectorId: ME, status: "accepted", at: "2024-06-02" }],
      catalog: CATALOG, goals: [], collectorCopies: [], binders: [], binderEntries: [], opportunities: [], counterparties: [],
      inventory: [{ invId: "i1", partnerId: P1, cardId: "k1", ask: 4200, cost: 3100,
        archived: false, status: "available" }] };
    const r = render(React.createElement(ProductionApp, { state: tp }));
    ["Collector Network", "Inventory", "Opportunities"].forEach((label) =>
      assert(buttons(r).some((b) => instText(b).includes(label)), `the TP lost ${label}`));
    assert(!buttons(r).some((b) => instText(b).includes("Your Cards")),
      "a Collector section leaked into the TP workspace");
    clickText(r, "Inventory");
    assert(/\$3,100/.test(flat(r)), "a TP can no longer see their own acquisition cost: " + flat(r));
  });

  test("neither application reaches into the other", () => {
    const tpFiles = fs.readdirSync(path.join(ROOT, "client", "tp"), { withFileTypes: true })
      .flatMap((e) => (e.isDirectory()
        ? fs.readdirSync(path.join(ROOT, "client", "tp", e.name)).map((f) => `client/tp/${e.name}/${f}`)
        : [`client/tp/${e.name}`]));
    tpFiles.forEach((rel) => assert(!/client\/collector|CollectorShell/.test(code(rel)),
      `${rel} reaches the Collector app`));
  });

  test("the demo is untouched and still has no production dependency", () => {
    ["shell/MetYetPrototype.jsx", "src/MetYet.jsx", "collector/MetYetCollector.jsx", "site-src/main.jsx"]
      .forEach((rel) => assert(!/client\/|app-src/.test(code(rel)), `${rel} reaches production`));
    const bundle = esbuild.buildSync({
      entryPoints: [path.join(ROOT, "site-src", "main.jsx")],
      bundle: true, format: "esm", write: false, logLevel: "silent", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"', __METYET_DEV__: "false", __METYET_DEMO__: "true" },
    }).outputFiles[0].text;
    ["supabase", "auth/v1", "Bearer ", "/api/view", "/api/commands", "CollectorShell", "mcs-panel"]
      .forEach((n) => assert(!bundle.includes(n), `the demo bundle contains "${n}"`));
  });

  test("no dependency was added", () => {
    const pkg = JSON.parse(src("package.json"));
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    assert(!Object.keys(all).some((d) => /supabase|axios|swr|react-query|tanstack|router|redux|zustand/.test(d)));
  });
});

run();
