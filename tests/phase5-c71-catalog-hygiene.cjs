/* ============================================================================
   PHASE 5 C7.1 — CATALOG HYGIENE

   Three small things, none of which is a feature.

   A. A pin that was asking the wrong question, and was wrong in the dangerous
      direction: it could not fail during the batch that broke it.
   B. A 13.6 MB card dataset that had sat in the repository unread since a single
      upload commit, with no verified licence basis, protected by two tests that
      asserted its continued existence.
   C. Four card surfaces in the DEPLOYED client, three of which drew an empty box
      when a card had no picture and none of which survived a picture that
      failed to load.

   WHAT THESE TESTS PROTECT. Behaviour, not shape. The primitive's failure
   transition is exercised once, properly — including the recovery that a naive
   implementation gets wrong — and each surface is then checked for having
   actually adopted it, rather than four near-identical render tests.
   ============================================================================ */

const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const React = require("react");
const TR = require("react-test-renderer");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const json = (v) => JSON.stringify(v);
/* Comments are stripped before a file is searched for what it DOES, so that a
   sentence explaining a thing is never mistaken for the thing. */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

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

const CardArt = build("client/card-art.jsx").default;

/* The four surfaces in the deployed client that draw a card's artwork, with the
   tile class each one owns. `client/` is the application Render deploys;
   `src/MetYet.jsx` is the prototype and is NOT this. */
const SURFACES = [
  ["client/browse/CardBrowser.jsx", 'br-art', 'br-plate'],
  ["client/collector/sections/MyCards.jsx", 'mcs-group-art', 'mcs-art-plate'],
  ["client/collector/sections/TrustedPartners.jsx", 'mcs-has-art', 'mcs-art-plate'],
  ["client/collector/sections/Binder.jsx", 'mcs-group-art', 'mcs-art-plate'],
];

/* WHY NOTHING BELOW ASKS "WHAT DID THIS BATCH CHANGE" (Phase 5 C7.1).
   A first draft of this suite answered that with `git diff <this batch's base>`
   against the working tree, reasoning that a working-tree comparison — unlike
   one ending at `HEAD` — gives the same answer before and after the commit, so
   it could not go falsely green. True, and beside the point: the moment C7.1
   merges, "changed since C7.1's base" means "changed since C7.1", so the next
   batch to touch `domain/` would have turned this suite red for a reason that
   has nothing to do with C7.1. That is the same mistake as the pin this batch
   exists to correct, wearing a different spelling — a batch-scoped question
   frozen into a permanent test.

   So every assertion below is about a property that is true now and should stay
   true: what the door holds, what the repository contains, what the deployed
   client renders. None of them needs a base. */
const tracked = (...paths) => {
  const { execFileSync } = require("child_process");
  return execFileSync("git", ["ls-files", ...paths], { cwd: ROOT, encoding: "utf8" })
    .split("\n").filter(Boolean);
};

const draw = (props) => {
  let r;
  TR.act(() => { r = TR.create(React.createElement(CardArt, props)); });
  return r;
};
const update = (r, props) => {
  TR.act(() => { r.update(React.createElement(CardArt, props)); });
  return r;
};
const imgs = (r) => r.root.findAll((n) => n.type === "img");
const plates = (r) => r.root.findAll((n) => typeof n.type === "string"
  && n.props.role === "img");
const fail = (r) => TR.act(() => {
  imgs(r).forEach((i) => i.props.onError && i.props.onError());
});

/* ------------------------------------------------------------------ A. the pin
   The corrected assertion lives in the C4 suite, where the claim belongs. What
   is checked here is the thing a bounded pin could quietly become: vacuous. */
describe("A. the corrected history pin still asks something", () => {

  test("C4's range is real, and the query inside it is not vacuous", () => {
    const { execFileSync } = require("child_process");
    const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
    /* If the range were empty, or the ends wrong, "C4 changed no persistence"
       would be true of nothing and would pass for ever. It is not: C4 changed
       files, and the pin's own query reports them. */
    const all = git("diff", "--name-only", "97fdba3", "dc2fd25").split("\n").filter(Boolean);
    assert(all.length > 0, "C4's range is empty, so the pin asserts nothing");
    assert(all.some((f) => f.startsWith("server/catalog/")),
      "C4's range does not contain C4's own work: " + all.join(","));
    /* And the narrowing to persistence/ is what makes it pass — not an empty
       range. Ask the same question of a path C4 DID change and it answers. */
    const narrowed = git("diff", "--name-only", "97fdba3", "dc2fd25", "--", "server/catalog/");
    assert(narrowed.trim().length > 0, "the path-narrowed query cannot see anything");
  });

  test("the fix did not weaken the live claim standing beside it", () => {
    /* Two claims share that test. One is archaeology — both ends frozen, so it
       can never change again, which is what "did C4 touch persistence" MEANS
       and is the whole correction. The other is live and does the real work:
       the newest migration is still 0013. Correcting the first must not have
       quietly dropped the second. */
    const suite = read("tests/phase5-c4-catalog-import.cjs");
    assert(/0013_binders\.sql/.test(suite), "the newest-migration assertion vanished");
  });

  test("no test compares history against a moving end", () => {
    /* The lesson, stated once as a rule rather than left in a report. A range
       ending at HEAD answers "has this changed SINCE", which is a different
       claim from "did that batch change this" — and it is green right up to the
       moment the breaking work becomes a commit, which is after the last verify
       that could have caught it.

       THIS IS A TRIPWIRE, NOT A PROOF, and it is worth being plain about that:
       a determined `execSync("git diff " + base + " HEAD")`, or a ref held in a
       variable, walks past any regex. What it does catch is the shape somebody
       reaches for without thinking, which is how the original got written. So
       it looks for HEAD near any git call at all, over every test file rather
       than the top directory, and deliberately allows `git show HEAD:<path>` —
       reading a file at the tip is not a range. */
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name))
        : (/\.(cjs|js|mjs)$/.test(e.name) ? [path.join(dir, e.name)] : []));
    const files = walk(path.join(ROOT, "tests"));
    assert(files.length > 100, "the walk found almost nothing: " + files.length);
    for (const abs of files) {
      const body = code(path.relative(ROOT, abs));
      for (const call of body.match(/git[\s\S]{0,300}?(\)|\])/g) || []) {
        if (!/["'](diff|log|rev-list|diff-tree|rev-parse|merge-base)["']|git (diff|log|rev-list)/
          .test(call)) continue;
        const moving = /["']HEAD["']|\.\.HEAD\b|\bHEAD\s*[,\]\)]/.test(call);
        assert(!moving, `${path.relative(ROOT, abs)} ranges against HEAD: ${call.slice(0, 110)}`);
      }
    }
  });
});

/* ------------------------------------------------------------- B. the dataset */
describe("B. the bundled dataset is gone, and nothing wants it back", () => {

  test("the file is not in the repository or its history's tip", () => {
    assert(!fs.existsSync(path.join(ROOT, "pokemon_cards.json")), "it is still on disk");
    const { execFileSync } = require("child_process");
    const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" });
    assert(!/pokemon_cards\.json/.test(tracked), "it is still tracked");
  });

  test("no build path, script or runtime file reaches for it", () => {
    const { execFileSync } = require("child_process");
    const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
      .split("\n").filter((f) => /\.(js|jsx|mjs|cjs|json|yaml|yml)$/.test(f));
    for (const f of tracked) {
      if (f.startsWith("Claude outputs/")) continue;   // reports describe it; that is their job
      if (f.startsWith("tests/")) continue;            // asserted separately below
      assert(!/pokemon_cards/.test(read(f)), `${f} still names the dataset`);
    }
  });

  test("no bundled card dataset is tracked anywhere in the repository", () => {
    /* Not "no JSON array at the root", which a first draft asserted and which a
       dump keyed by card id would walk straight past. By SIZE and EXTENSION
       across everything tracked: a card catalogue is a large data file, whatever
       it is called and wherever it is put. The threshold is generous enough that
       no source file approaches it and tight enough that 32,599 records cannot
       hide under it. */
    const data = tracked().filter((f) => /\.(json|jsonl|ndjson|csv|tsv)$/i.test(f))
      .filter((f) => f !== "package-lock.json")
      .filter((f) => fs.existsSync(path.join(ROOT, f))
        && fs.statSync(path.join(ROOT, f)).size > 256 * 1024);
    eq(json(data), json([]), "a bundled dataset is tracked: " + data.join(","));
  });

  test("the PUBLISHED demo reaches no remote host but the ones it declares", () => {
    /* THE CURRENT PROPERTY, ASKED OF WHAT IS PUBLISHED (C7.1 amendment).
       `.github/workflows/deploy.yml` builds `npm run build:site` on every push
       to `main` and publishes `site/` to demo.metyet.io. So `src/MetYet.jsx`
       and everything the site entry imports are not a private prototype, and a
       stock-artwork URL in any of them is a live request from every visitor's
       browser to a provider whose usage basis MetYet has not established.

       TWO THINGS A FIRST DRAFT OF THIS TEST GOT WRONG, both found by the
       adversarial pass and both worth stating rather than quietly fixing.

       It scanned a hand-written list of directories — `src`, `collector`,
       `shell`, `site-src` — while claiming in its own comment to cover "every
       file the site entry reaches". It does not: `src/MetYet.jsx` imports from
       `domain/` and `shared/`, both of which are bundled into the published
       site and neither of which was scanned. The module graph is now WALKED
       from the site's entry point, so the set is whatever is actually
       published, including a file added tomorrow.

       And it looked for one shape — a literal `https://images.<host>/x.png`.
       A concatenated host, a protocol-relative `//host/x.png`, an `.svg`, a
       query string before the extension, an `img.` host and a CDN `import`
       all walked straight past. So the rule is inverted: EVERY remote
       reference in the published tree must be one this test names. A new host
       fails until somebody adds it here on purpose, which is the point.

       WHAT IT STILL CANNOT SEE, stated plainly: a host assembled at runtime
       from pieces, or hidden in base64. This is a tripwire for the shape
       somebody reaches for, not a proof. */
    const ALLOWED = [
      "https://fonts.googleapis.com",   // a stylesheet, not card artwork
      "https://fonts.gstatic.com",
      "http://www.w3.org",              // SVG/XML namespaces, never fetched
      "https://reactjs.org",            // React's own error-decoder link
    ];

    /* Walk the module graph from the entry the published build actually uses. */
    const entry = (() => {
      const build = read("site.build.mjs");
      const m = /const SRC = "([^"]+)"/.exec(build);
      assert(m, "site.build.mjs no longer declares its entry point");
      return m[1];
    })();
    const seen = new Set();
    const walk = (rel) => {
      if (seen.has(rel) || !fs.existsSync(path.join(ROOT, rel))) return;
      seen.add(rel);
      const body = read(rel);
      for (const m of body.matchAll(/from\s+["'](\.[^"']+)["']|import\s+["'](\.[^"']+)["']/g)) {
        const spec = m[1] || m[2];
        let next = path.normalize(path.join(path.dirname(rel), spec));
        if (!fs.existsSync(path.join(ROOT, next))) {
          for (const ext of [".jsx", ".js", ".mjs", ".cjs", "/index.jsx", "/index.js"]) {
            if (fs.existsSync(path.join(ROOT, next + ext))) { next += ext; break; }
          }
        }
        walk(next.split(path.sep).join("/"));
      }
    };
    walk(entry);
    /* The walk must have found the files the site is known to contain, or it
       is scanning nothing and passing for it. */
    assert(seen.size >= 5, "the module walk found almost nothing: " + [...seen].join(","));
    for (const known of ["src/MetYet.jsx", "collector/MetYetCollector.jsx",
      "shell/MetYetPrototype.jsx"]) {
      assert(seen.has(known), "the walk missed a known published file: " + known);
    }

    for (const rel of seen) {
      const body = read(rel);
      assert(!/pokemontcg|tcgdex|scrydex/i.test(body), `${rel} names a card-art provider`);
      const refs = [
        /* `*` not `+`: a bare `"https://"` about to be concatenated with a host
           held in a variable is the whole point, and a `+` quantifier finds
           nothing in it and passes. */
        ...(body.match(/https?:\/\/[^\s"'`)]*/g) || []),
        /* Protocol-relative, preceded by a quote, a backtick, a bracket or
           whitespace — a template literal opens with a backtick, which a
           whitespace-only lookbehind does not match. */
        ...(body.match(/(?<=^|[\s"'`([=,])\/\/[a-z0-9-]+\.[a-z]{2,}[^\s"'`)]*/gim) || []),
      ];
      for (const url of refs) {
        assert(ALLOWED.some((ok) => url.startsWith(ok)),
          `${rel} reaches an undeclared remote host: ${url}`);
      }
    }
  });

  test("the built published site, if present, carries no provider reference", () => {
    /* Belt and braces over the SOURCE assertion above, which is the one that
       must always hold. This one is skipped rather than failed when `site/` has
       not been built — and it usually has not: `npm run verify` does not run
       `build:site`, and neither does the deploy workflow before publishing. So
       do not mistake this for the guard. It catches only a build step that
       could reintroduce what the sources no longer contain. */
    const out = path.join(ROOT, "site", "main.js");
    if (!fs.existsSync(out)) return;
    const built = fs.readFileSync(out, "utf8");
    assert(!/pokemontcg|tcgdex|scrydex/i.test(built), "the built site names a provider");
    assert(!/images\.[a-z0-9-]+\.[a-z]{2,}\//i.test(built), "the built site names an image host");
  });

  test("the deployed client names no card provider at all", () => {
    /* Asked of what is DEPLOYED, and asked always rather than of a diff. Reports
       describe providers because describing them is their job, and the
       neutrality pins NAME the providers they forbid — so neither is the
       subject here. `client/` and `app-src/` are, because that is the bundle
       Render serves. The published demo site is a different build from
       different sources and has its own assertion above — it used to hot-link
       a provider's CDN and no longer does. */
    for (const f of tracked("client", "app-src")) {
      assert(!/scrydex|tcgdex|pokemontcg/i.test(read(f)), `${f} names a card provider`);
      assert(!/assets\.tcgdex|images\.pokemontcg/i.test(read(f)), `${f} hot-links a provider CDN`);
    }
  });
});

/* -------------------------------------------------------------- C. the picture */
describe("C. a card is readable with no picture, and with a broken one", () => {

  test("a card with no image shows its name, not an empty box", () => {
    const r = draw({ src: null, name: "Charizard", wrap: "w", plate: "pl" });
    eq(imgs(r).length, 0, "an image was rendered for a card that has none");
    eq(plates(r).length, 1, "no plate stood in for it");
    eq(plates(r)[0].children.join(""), "Charizard", "the plate does not name the card");
  });

  test("an empty or whitespace URL is the same as none", () => {
    for (const src of ["", "   ", null, undefined]) {
      const r = draw({ src, name: "Blastoise", wrap: "w", plate: "pl" });
      eq(imgs(r).length, 0, `an <img> was rendered for src=${json(src)}`);
      eq(plates(r).length, 1, `no plate for src=${json(src)}`);
    }
  });

  test("a URL that loads renders the picture and no plate", () => {
    const r = draw({ src: "https://example.test/x.png", name: "Venusaur", wrap: "w", plate: "pl" });
    eq(imgs(r).length, 1, "the picture was not rendered");
    eq(imgs(r)[0].props.src, "https://example.test/x.png", "a different URL was rendered");
    eq(plates(r).length, 0, "a plate was drawn beside a working picture");
    /* alt is empty on purpose: the card is named beside the picture, and an alt
       that repeats it makes a screen reader say the card twice. */
    eq(imgs(r)[0].props.alt, "", "the picture carries a duplicate alt");
  });

  test("a URL that FAILS falls back to the same plate", () => {
    const r = draw({ src: "https://example.test/gone.png", name: "Mudkip", wrap: "w", plate: "pl" });
    eq(imgs(r).length, 1, "no picture was attempted");
    fail(r);
    eq(imgs(r).length, 0, "the broken picture is still in the tree");
    eq(plates(r).length, 1, "nothing stood in for the broken picture");
    eq(plates(r)[0].children.join(""), "Mudkip", "the fallback does not name the card");
  });

  test("the fallback cannot loop: a failed plate has no image to fail again", () => {
    const r = draw({ src: "https://example.test/gone.png", name: "Snorlax", wrap: "w", plate: "pl" });
    fail(r);
    fail(r);   // no <img> remains, so this is a no-op rather than a second cycle
    eq(imgs(r).length, 0, "an image came back");
    eq(plates(r).length, 1, "the plate multiplied");
  });

  test("a NEW valid URL recovers: the old failure is not remembered", () => {
    /* The bug a naive implementation has. React reuses the component instance as
       a list re-renders or re-sorts, so a failure remembered from the previous
       card would blank the picture of a perfectly good next one. */
    const r = draw({ src: "https://example.test/gone.png", name: "Eevee", wrap: "w", plate: "pl" });
    fail(r);
    eq(imgs(r).length, 0, "precondition: it did not fall back");
    update(r, { src: "https://example.test/good.png", name: "Eevee", wrap: "w", plate: "pl" });
    eq(imgs(r).length, 1, "a new URL was suppressed by the previous failure");
    eq(imgs(r)[0].props.src, "https://example.test/good.png", "the wrong URL was restored");
    eq(plates(r).length, 0, "the plate stayed after recovery");
  });

  test("re-rendering with the SAME failed URL does not retry it forever", () => {
    const r = draw({ src: "https://example.test/gone.png", name: "Ditto", wrap: "w", plate: "pl" });
    fail(r);
    update(r, { src: "https://example.test/gone.png", name: "Ditto", wrap: "w", plate: "pl" });
    eq(imgs(r).length, 0, "the known-bad URL was tried again on every render");
  });

  test("the tile is the same box either way, so nothing on the row moves", () => {
    const withArt = draw({ src: "https://example.test/x.png", name: "Gengar",
      wrap: "mcs-group-art", plate: "mcs-art-plate" });
    const without = draw({ src: null, name: "Gengar", wrap: "mcs-group-art", plate: "mcs-art-plate" });
    const wrapOf = (r) => r.root.findAll((n) => typeof n.type === "string"
      && String(n.props.className || "").includes("mcs-group-art"))[0];
    eq(wrapOf(withArt).props.className, wrapOf(without).props.className,
      "the tile changes class when the picture is missing, so its size can change");
    /* The 5/7 box lives on the wrapper, which is identical in both cases. */
    assert(/\.mcs-group-art\s*\{[^}]*aspect-ratio:5\/7/.test(read("client/collector/CollectorShell.jsx")),
      "the tile no longer holds its own shape");
  });

  test("the plate is announced as a picture, and names the card", () => {
    const r = draw({ src: null, name: "Alakazam", wrap: "w", plate: "pl" });
    const plate = plates(r)[0];
    eq(plate.props.role, "img", "not announced as an image");
    eq(plate.props["aria-label"], "Alakazam", "not named to assistive tech");
    assert(plate.props["aria-hidden"] !== "true", "hidden from screen readers");
  });

  test("a card MetYet cannot NAME gets the empty tile, not a made-up label", () => {
    /* The first draft of this component invented "card" here, and the three
       collector surfaces handed it their row title — which, for a card whose
       description has not arrived, is the string "Loading this card…". So the
       tile that was added to say WHICH CARD THIS IS said "Loading this card…"
       beside a title already saying "Loading this card…", permanently if the
       description failed. An empty tile is the honest answer to a card MetYet
       cannot name; a filled one is not. */
    for (const name of ["", "   ", null, undefined]) {
      const r = draw({ src: null, name, wrap: "w", plate: "pl" });
      eq(plates(r).length, 0, `a plate was invented for name=${json(name)}`);
      eq(imgs(r).length, 0, "an image appeared from nowhere");
      const wraps = r.root.findAll((n) => n.type === "span" && n.props.className === "w");
      eq(wraps.length, 1, "the tile itself vanished, so the row will move");
    }
  });

  test("a decorative plate is not read out beside a title that already said it", () => {
    /* Browse leaves `decorative` false: in a grid of pictures the plate IS the
       identification. The three collector surfaces set it, because the card's
       name is rendered as text an inch away and announcing it twice is noise. */
    const loud = draw({ src: null, name: "Alakazam", wrap: "w", plate: "pl" });
    eq(loud.root.findAll((n) => n.props.role === "img").length, 1, "Browse's plate is silent");
    const quiet = draw({ src: null, name: "Alakazam", wrap: "w", plate: "pl", decorative: true });
    const q = quiet.root.findAll((n) => n.type === "span" && n.props.className === "pl")[0];
    eq(q.props["aria-hidden"], "true", "a duplicate plate is announced anyway");
    assert(!q.props.role, "a hidden plate still claims to be an image");
    eq(q.children.join(""), "Alakazam", "the visible text was dropped along with the label");
  });

  test("recovery happens in the render that notices, not a frame later", () => {
    /* A `useEffect` reset would commit one paintable frame showing the fallback
       for a picture that is perfectly good, and churn span→img on every re-sort
       of a list containing a previously-failed tile. Adjusting the state during
       the render that notices the URL changed has no intermediate commit — so
       the component must hold no effect at all. */
    const body = code("client/card-art.jsx");
    assert(!/useEffect|useLayoutEffect/.test(body),
      "the reset is an effect, so a stale fallback is painted for one frame");
    assert(/if\s*\(tried\s*!==\s*url\)/.test(body), "nothing notices the URL changed");
  });

  test("nothing here fetches, constructs a URL, or names a provider", () => {
    /* READ RAW, NOT STRIPPED. The comment stripper removes everything after a
       `//`, which turns "https://images.pokemontcg.io/x" into "https:" — so a
       hardcoded provider URL would slip past both of the assertions written to
       forbid it. A comment mentioning a provider is not the hazard here; a URL
       is, and a URL contains the sequence the stripper eats. */
    const raw = read("client/card-art.jsx");
    assert(!/fetch\(|XMLHttpRequest|new Image\(/.test(raw), "it reaches the network");
    assert(!/https?:\/\/[a-z]/i.test(raw), "it contains a URL");
    assert(!/scrydex|tcgdex|pokemontcg|assets\.[a-z]/i.test(raw), "it names a provider");
    assert(!/localStorage|sessionStorage|indexedDB/.test(raw), "a failed image was persisted");
  });
});

/* --------------------------------------------------------------- D. adoption */
describe("D. all four deployed surfaces use it", () => {

  for (const [rel, wrap, plate] of SURFACES) {
    test(`${rel.split("/").pop()} draws its artwork through the shared primitive`, () => {
      const body = code(rel);
      assert(/import CardArt from ["'][^"']*card-art\.jsx["']/.test(body),
        "it does not import the primitive");
      const use = body.match(/<CardArt[\s\S]{0,240}?\/>/);
      assert(use, "it does not render the primitive");
      assert(/src=\{/.test(use[0]), "no src is passed: " + use[0]);
      assert(/name=\{/.test(use[0]), "no name is passed: " + use[0]);
      /* Either spelling: Browse composes its class from a seat prefix, the three
         collector surfaces name theirs outright. What is pinned is the CLASS,
         because the class is what carries the tile's 5/7 box. */
      assert(use[0].includes(wrap), `the tile class changed: ${use[0]}`);
      assert(use[0].includes(plate), `the plate class changed: ${use[0]}`);
      /* And it kept no second way of drawing a card's picture. */
      assert(!/<img\b/.test(body), "a bare <img> for card art remains in " + rel);
    });
  }

  test("no second way of drawing a CARD's picture survives in the deployed client", () => {
    /* Scoped to card artwork on purpose. A blanket ban on `<img>` would forbid a
       logo or an avatar for ever, which is not this batch's business; what must
       not come back is a second, unguarded path for the one image whose URL
       MetYet does not control. */
    const strays = tracked("client", "app-src")
      .filter((f) => f !== "client/card-art.jsx")
      .filter((f) => { const b = code(f); return /<img\b/.test(b) && /imageSmall|imageLarge/.test(b); });
    eq(json(strays), json([]), "a card <img> lives outside the primitive: " + strays.join(","));
  });

  test("the shared plate is styled, once, for every tile size that uses it", () => {
    const css = read("client/collector/CollectorShell.jsx");
    assert(/\.mcs-art-plate\s*\{/.test(css), "the shared plate has no style");
    assert(/\.mcs-has-art\s+\.mcs-art-plate\s*\{/.test(css),
      "the 34px tile reuses the 52px tile's type size and will overflow");
    /* A name too long for the box is truncated at the END. Without this the
       plate is centred in the tile and a long name is clipped at BOTH ends,
       leaving half a line of letters top and bottom — worse than the empty tile
       it replaced. */
    assert(/-webkit-line-clamp/.test(css), "a long card name is clipped mid-line at both ends");
    assert(!/\.mcs-group-plate\b/.test(css), "the orphan class it replaced is still declared");
  });

  test("the door, the command table and the schema are where C7.1 found them", () => {
    const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
    eq(EXPOSED_COMMANDS.length, 18, "the production door moved");
    eq(Object.keys(require("../domain/metyet-commands.js").COMMANDS).length, 49,
      "the domain's command table moved");
  });
});

if (require.main === module) run();
