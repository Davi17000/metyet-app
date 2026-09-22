/* ============================================================================
   PHASE 4 BATCH 7 — THE COLLECTOR PRODUCTION SHELL

   A Collector who signs in now reaches their own application instead of a note
   saying it does not exist. These tests are about the ways a second seat can go
   wrong: by being routed to the wrong product, by being named from somewhere
   other than the token, by carrying a Trusted Partner's private figures across,
   by carrying another Collector's data, or by counting something it had to
   invent a rule to count.

   TWO KINDS OF FIXTURE, DELIBERATELY. `REAL` is `projectForActor()` run over
   the demo seed for one Collector — the actual output of the actual projection,
   so the shapes are not a memory of what the server sends. It is an INPUT to
   the production components; nothing in `client/` imports any of it, which
   section F proves. Hand-built fixtures carry the adversarial cases, including
   ones the real projection could never produce — a Collector projection with a
   Trusted Partner's acquisition cost in it, say — because the point is that the
   SCREEN does not render them either.

     A  the seat routes, and the seats stay apart
     B  identity comes from the projection and nowhere else
     C  the shell: the three sections, and truthful counts
     D  privacy: TP-private and cross-Collector data
     E  navigation, session and loading behaviour
     F  no demo, no prototype, no store, no domain
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

const load = (rel, define = {}) => {
  const out = esbuild.buildSync({
    entryPoints: [path.join(ROOT, rel)],
    bundle: true, format: "cjs", write: false, logLevel: "silent", jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
    define: { "process.env.NODE_ENV": '"production"', ...define },
  });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};

const ACTOR = load("client/actor.js");
const AUTH = load("client/supabase-auth.js");
const SESSION = load("client/supabase-session.js");
const API = load("client/api.js");
const STORE = load("client/production-store.js");
const SIGNIN = load("client/sign-in/SignIn.jsx");
const ProductionApp = load("client/production-app.jsx").default;
const SHELL_MOD = load("client/collector/CollectorShell.jsx");
const CollectorShell = SHELL_MOD.default;

/* Every file the Collector surface is made of, found rather than listed, so a
   new section cannot join the product without joining these assertions. */
const COLLECTOR_FILES = fs.readdirSync(path.join(ROOT, "client", "collector"), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory()
    ? fs.readdirSync(path.join(ROOT, "client", "collector", e.name)).map((f) => `client/collector/${e.name}/${f}`)
    : [`client/collector/${e.name}`]));

const PROJECT = "https://projectref.supabase.co";
const KEY = "sb_publishable_example";
const APP = "https://app.metyet.io";
const EMAIL = "casey@example.com";
const OTP = "24681357";
const ACCESS = "eyJaccess.token.production";
const COLLECTOR = "c-8x21";
const PARTNER = "p-9k2m";

/* C1 put Browse at the front: it is where a Collector finds a card, and
   saying "I am looking for this" now happens while browsing. */
/* RESTATED IN C3.4. Your Cards was built in C2 and deferred through four
   batches; C3.4 fixed its canonical naming and moved it into the product.
   The list is the product's own order and words, and it is stated here once
   so every assertion below reads the same one. */
const NAV = ["Browse", "Goals", "Your Cards", "Trusted Partners"];
const TP_NAV = ["Collector Network", "Inventory", "Opportunities"];

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

/* Taken before any test renders. A snapshot taken inside the mutation test
   would compare an earlier test's damage against itself. */
const REAL_PRISTINE = JSON.stringify(REAL);

/* --------------------------------------------------------- hand fixtures */

const EMPTY = Object.freeze({
  actor: { seat: "collector", collectorId: COLLECTOR },
  collectors: [{ id: COLLECTOR, name: "Casey Lin", short: "Casey L.", city: "Brooklyn, NY" }],
  partners: [], relationships: [], invitations: [], goals: [], preferences: [],
  inventory: [], collectorCopies: [], binders: [], binderEntries: [], interests: [], opportunities: [], conversations: [],
  activity: [], photoRequests: [], copyReviews: [], counterparties: [], catalog: [],
});

const FULL = Object.freeze({
  ...EMPTY,
  goals: [{ id: "g1", collectorId: COLLECTOR, cardId: "k1", tier: "primary" },
    { id: "g2", collectorId: COLLECTOR, cardId: "k2", tier: "secondary" }],
  collectorCopies: [{ offered: true, id: "b1", collectorId: COLLECTOR, cardId: "k3", status: "available" }],
  partners: [{ id: PARTNER, name: "Northline Cards", city: "Duluth, Minnesota" },
    { id: "p-2", name: "Second Shop" }, { id: "p-3", name: "Third Shop" }],
  relationships: [{ partnerId: PARTNER, collectorId: COLLECTOR, status: "accepted", at: "2025-09-03" }],
  opportunities: [{ id: "o1", collectorId: COLLECTOR, goalId: "g1", stage: "select-trade" },
    { id: "o2", collectorId: COLLECTOR, goalId: "g2", stage: "completed" }],
});

const TP_VIEW = Object.freeze({
  actor: { seat: "tp", partnerId: PARTNER },
  partners: [{ id: PARTNER, name: "Northline Cards" }],
  collectors: [], relationships: [], goals: [], collectorCopies: [], binders: [], binderEntries: [], inventory: [],
  opportunities: [], catalog: [], counterparties: [],
});

/* ------------------------------------------------------------- rendering */

const render = (element) => {
  let r;
  TR.act(() => { r = TR.create(element); });
  return r;
};
const flush = async (r) => { await TR.act(async () => { await new Promise((res) => setTimeout(res, 0)); }); return r; };
/* What a person would READ. A <style> child is a string too, and the shell's
   stylesheet would otherwise satisfy half the assertions in this file. */
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
const hasButton = (r, label) => buttons(r).some((n) => instText(n).includes(label));
const clickText = (r, label) => {
  const button = buttons(r).find((n) => instText(n).includes(label));
  assert(button, `no button "${label}" among: ${buttons(r).map(instText).join(" | ")}`);
  TR.act(() => { button.props.onClick(); });
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
const looksLikeCollectorShell = (r) => NAV.every((label) => hasButton(r, label));
const looksLikeTpShell = (r) => TP_NAV.every((label) => hasButton(r, label));

/* The whole signed-in flow, through the real modules. */
function wire({ otp = { status: 200, body: {} },
  verify = { status: 200, body: { access_token: ACCESS, refresh_token: "r", token_type: "bearer",
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "s", email: EMAIL } } },
  view = { status: 200, body: { version: 1, state: FULL } }, logout = { status: 204, body: {} } } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, method: (init && init.method) || "GET", headers: (init && init.headers) || {},
      body: init && init.body ? JSON.parse(init.body) : undefined });
    const reply = url.includes("/auth/v1/otp") ? otp
      : url.includes("/auth/v1/verify") ? verify
        : url.includes("/auth/v1/logout") ? logout
          : url.includes("/auth/v1/token") ? verify : view;
    if (reply instanceof Error) throw reply;
    return { status: reply.status, async json() { return reply.body; } };
  };
  const auth = AUTH.createSupabaseAuth({ supabaseUrl: PROJECT, publishableKey: KEY, fetchImpl: impl });
  const session = SESSION.createSupabaseSession({ auth });
  const api = API.createApiClient({ baseUrl: APP, getToken: () => session.token(), fetchImpl: impl });
  const store = STORE.createProductionStore({ api });
  return { calls, session, store };
}

const signedIn = async (opts) => {
  const w = wire(opts);
  const r = render(React.createElement(SIGNIN.default, { session: w.session, store: w.store }));
  const type = (id, value) => {
    const el = r.root.findAll((n) => n.type === "input" && n.props.id === id)[0];
    assert(el, `no input ${id}`);
    TR.act(() => { el.props.onChange({ target: { value } }); });
  };
  const submit = () => {
    const form = r.root.findAll((n) => n.type === "form")[0];
    TR.act(() => { form.props.onSubmit({ preventDefault() {} }); });
  };
  type("metyet-email", EMAIL); submit(); await flush(r);
  type("metyet-code", OTP); submit(); await flush(r);
  return { ...w, r };
};

/* ============================================================== A */
describe("A. the seat routes, and the seats stay apart", () => {
  test("a valid Collector projection routes all the way to the Collector shell", async () => {
    const { r } = await signedIn();
    assert(looksLikeCollectorShell(r), "the Collector app is not on screen: " + flat(r));
    assert(flat(r).includes("Casey Lin"), "and does not name them: " + flat(r));
    assert(!/isn't part of this release/.test(flat(r)), "the old notice is still there: " + flat(r));
  });

  test("a Collector never sees the Trusted Partner workspace", () => {
    const r = render(React.createElement(ProductionApp, { state: FULL }));
    assert(looksLikeCollectorShell(r));
    assert(!looksLikeTpShell(r), "a TP shell rendered for a Collector: " + flat(r));
    TP_NAV.forEach((label) => assert(!flat(r).includes(label), `${label} leaked in: ` + flat(r)));
  });

  test("a Trusted Partner never sees the Collector app", () => {
    const r = render(React.createElement(ProductionApp, { state: TP_VIEW }));
    assert(looksLikeTpShell(r), "the TP lost their workspace: " + flat(r));
    assert(!looksLikeCollectorShell(r), "a TP was shown the Collector app: " + flat(r));
    assert(!/Your Cards/.test(flat(r)), "a Collector section leaked in: " + flat(r));
  });

  test("the router names both seats and nothing else decides", () => {
    const bare = code("client/production-app.jsx");
    assert(/who\.seat === "tp"/.test(bare) && /who\.seat === "collector"/.test(bare),
      "the two seats are not both routed here");
    assert(/describeActor\(state\)/.test(bare), "the seat does not come from the projection");
    assert(!/localStorage|sessionStorage|document\.cookie|location\.(search|hash|pathname)/.test(bare),
      "the router reads a seat from storage or the URL");
    /* The last branch is still the refusal. */
    const lastReturn = bare.slice(bare.lastIndexOf("return"));
    assert(/^return \(\s*<Plain/.test(lastReturn.trim()), "the default branch is not the refusal");
  });
});

/* ============================================================== B */
describe("B. identity comes from the projection, and nowhere else", () => {
  test("the name is found by the actor's own id, not by row order", () => {
    /* A Collector projection holds exactly one collector row — their own. A
       decoy placed first is the shape that would break a `records[0]` reading. */
    const state = { ...FULL, collectors: [
      { id: "c-decoy", name: "Someone Else Entirely" },
      { id: COLLECTOR, name: "Casey Lin" },
    ] };
    const shown = flat(show(state));
    assert(shown.includes("Casey Lin"), "the actor's own record: " + shown);
    assert(!shown.includes("Someone Else Entirely"), "a decoy named the person: " + shown);
    eq(ACTOR.describeActor(state).id, COLLECTOR);
  });

  test("a projection naming nobody invents nobody", () => {
    const shown = flat(show({ ...FULL, collectors: [] }));
    assert(!shown.includes("Casey"), "a name was invented: " + shown);
    assert(!shown.includes(COLLECTOR), "or the raw id shown in its place: " + shown);
    assert(shown.includes("Your account"), "and it says so neutrally: " + shown);
  });

  test("no prop, URL, query, storage or email can name the Collector", () => {
    /* Every extra prop the component could be handed. None of them is read. */
    const r = render(React.createElement(CollectorShell, { state: FULL,
      collectorId: "c-attacker", actor: { collectorId: "c-attacker" }, seat: "tp",
      email: "attacker@example.com", name: "Attacker" }));
    const shown = flat(r);
    assert(shown.includes("Casey Lin"), "the projection's name was replaced: " + shown);
    assert(!shown.includes("Attacker") && !shown.includes("attacker@example.com"), shown);
    assert(looksLikeCollectorShell(r), "a prop changed the product: " + shown);

    for (const rel of [...COLLECTOR_FILES, "client/production-app.jsx", "client/actor.js"]) {
      const bare = code(rel);
      assert(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(bare), `${rel} reads storage`);
      assert(!/location\.(search|hash|pathname|href)|URLSearchParams/.test(bare), `${rel} reads the URL`);
      assert(!/(collectorId|partnerId|seat)\s*[:=]\s*["'`]/.test(bare), `${rel} assigns a literal identity`);
      /* IDENTITY from an email is what this forbids. Batch 8 renders a Trusted
         Partner's contact email, which is projected profile data
         (PARTNER_FOR_COLLECTOR) and has nothing to do with who is signed in.
         The rule is now about the use, not the word. */
      assert(!/email\s*[=:]\s*[^,;)\n]*\b(actor|collector|me|self|who)\b|byEmail|emailToActor|findBy(Email|Address)/i.test(bare),
        `${rel} resolves identity from an email address`);
    }
  });

  test("a malformed actor fails closed, with no demo and no seat fallback", () => {
    const malformed = [null, {}, { seat: "collector" }, { seat: "collector", collectorId: "" },
      { seat: "collector", collectorId: 7 }, { seat: "collector", id: COLLECTOR },
      { seat: "COLLECTOR", collectorId: COLLECTOR }, { seat: "buyer", collectorId: COLLECTOR },
      { collectorId: COLLECTOR }];
    for (const actor of malformed) {
      const r = render(React.createElement(ProductionApp, { state: { ...FULL, actor } }));
      const shown = flat(r);
      assert(!looksLikeCollectorShell(r), `${JSON.stringify(actor)} reached the Collector app`);
      assert(!looksLikeTpShell(r), `${JSON.stringify(actor)} reached the TP workspace`);
      assert(!shown.includes("Casey Lin"), `${JSON.stringify(actor)} named somebody: ` + shown);
      assert(hasButton(r, "Sign out"), `${JSON.stringify(actor)} left no way out`);
      /* And no demo persona, ever. */
      assert(!/Casey Lin, Collector|Northline Cards|Switch persona|Prototype/.test(shown),
        `${JSON.stringify(actor)} fell back to the demo: ` + shown);
    }
  });
});

/* ============================================================== C */
describe("C. the shell: its sections, and counts that are row counts", () => {
  /* RESTATED IN BATCH 8.1 — the count went from three to two. What this test
     protects is unchanged: the navigation is exactly the product's sections, in
     the product's order and the product's words, with nothing extra. The Trade
     Binder is now declared deferred rather than shown, and is asserted to be
     unreachable rather than merely counted. */
  test("the sections are the product's own, in its own words", () => {
    const r = show(FULL);
    const labels = buttons(r).map(instText).filter((s) => NAV.some((n) => s.includes(n)));
    eq(labels.length, NAV.length, "no section more, none fewer: " + labels.join(" | "));
    NAV.forEach((n, i) => assert(labels[i].includes(n), `section ${i} is not ${n}`));
    eq(SHELL_MOD.SECTIONS.map((s) => s.id).join(","), "browse,goals,my-cards,partners");
    /* SUPERSEDED AND RESTATED (Phase 5 C3.4).
       What this protected: that a section which could never hold anything was
       declared deferred rather than shown — Your Cards promised a Collector
       something the product could not yet give them.
       Why it is no longer correct: it can hold something now. C2 gave a copy a
       canonical card, C3.3 gave a person a way to record one, and C3.4 fixed
       the screen's own canonical naming, which was the last reason it was not
       offered.
       What replaces it, and why it is stricter: the deferral LIST survives,
       empty, because it is the declared place a not-ready section waits — and
       the assertion is now that nothing is waiting there AND that every id in
       it, if one ever returns, is absent from the navigation. The old form
       could only say one specific id was missing. */
    eq(SHELL_MOD.DEFERRED_SECTIONS.map((s) => s.id).join(","), "");
    const shown = buttons(r).map(instText).join(" | ");
    for (const s of SHELL_MOD.DEFERRED_SECTIONS) {
      assert(!shown.includes(s.label), `a deferred section is reachable: ${s.label}`);
    }
    /* And the prototype agrees about the labels that CAME from it. Browse is
       C1's own and the prototype has no equivalent — it never had a gallery —
       so the provenance check is made of the sections it did give us, and
       Browse is held to being named here instead. */
    /* RESTATED IN C3.4. Two labels are now the production product's own rather
       than inherited: Browse is C1's (the prototype never had a gallery) and
       "Your Cards" is C2's, which deliberately RENAMED the prototype's "Trade
       Binder" because owning and offering had stopped being one fact. So the
       provenance check is made of the labels that genuinely came from the
       prototype, and the two that did not are held to being absent from it —
       which is the stronger half, since a label drifting back would mean the
       rename had quietly come undone. */
    const proto = src("collector/MetYetCollector.jsx");
    const OWN = ["Browse", "Your Cards"];
    NAV.filter((n) => !OWN.includes(n))
      .forEach((n) => assert(proto.includes(`label: "${n}"`), `the prototype does not call it ${n}`));
    OWN.forEach((n) => assert(!proto.includes(`label: "${n}"`),
      `the prototype grew a ${n} of its own`));
  });

  test("each count is the number of rows in one projected collection", () => {
    const shown = flat(show(FULL));
    /* 2 goals, 3 partners — counted, not derived. The binder copy in FULL is
       still there and is still not counted anywhere, because the section that
       counted it is no longer offered. */
    assert(/2 Goals/.test(shown), "goals: " + shown);
    assert(/3 Trusted Partners/.test(shown), "partners: " + shown);
    /* RESTATED IN C3.4: Your Cards is offered now, and its count is its own
       collection's — `collectorCopies` — which is exactly what this test is
       for. FULL holds one copy. */
    assert(/1 Your Cards/.test(shown), "your cards: " + shown);
    /* RESTATED IN C1. Browse counts NOTHING, and that is the point: the
       catalogue is not a collection of this Collector's, so a number beside it
       would be a fact about MetYet wearing the clothes of a fact about them.
       Every section that DOES carry a count still sources it from its own
       collection, which is what this test has always been for. */
    const counted = SHELL_MOD.SECTIONS.filter((s) => s.count);
    eq(counted.map((s) => s.count).join(","), "goals,collectorCopies,partners",
      "a count is sourced from something other than its own collection");
    eq(counted.map((s) => s.id).join(","), "goals,my-cards,partners", "a section grew a count");
    /* Read from the section list rather than the rendered text, where "Browse"
       and the next section's count sit side by side and any regex would be
       reading one as the other. */
    assert(!SHELL_MOD.SECTIONS.find((s) => s.id === "browse").count,
      "Browse acquired a count");
  });

  test("a count follows the collection, not the order or the first row", () => {
    const shuffled = { ...FULL,
      goals: [...FULL.goals].reverse(),
      partners: [...FULL.partners].reverse() };
    eq(flat(show(shuffled)).includes("3 Trusted Partners"), true);
    eq(flat(show({ ...FULL, partners: [] })).includes("0 Trusted Partners"), true);
    eq(flat(show({ ...FULL, goals: [] })).includes("0 Goals"), true);
  });

  test("nothing is counted that would need a rule to count", () => {
    /* The projection carries opportunities; the shell shows no opportunities
       count, because "active" is a judgement and it is the server's. Goals is
       the only transaction workflow, so a deal is a goal being worked. */
    const shown = flat(show(FULL));
    assert(!/opportunit/i.test(shown), "an opportunities section or count appeared: " + shown);
    /* What is forbidden is a NUMBER the shell had to reason about a lifecycle
       to produce — not the word "deal", which the product uses to explain what
       a goal is for. An earlier version of this assertion banned the noun and
       flagged "the only way a deal starts in MetYet", which is copy, not a
       count. The source assertion below is where the real guard lives. */
    assert(!/\d+\s*(deals?|opportunit\w*|negotiations?|active|in progress|awaiting)/i.test(shown),
      "a lifecycle-derived count appeared: " + shown);
    /* RECONSTRUCTING a lifecycle is what this forbids, not RENDERING one the
       server decided. Batch 8 shows the server's own `stage` under the goal it
       names — read verbatim, marked when unknown, never derived. What must not
       appear is the domain's own reasoning: whose turn it is, whether a deal is
       negotiating, what the next step would be. */
    const bare = COLLECTOR_FILES.map(code).join("\n");
    assert(!/isNegotiating|turnFor|nextActor|isCompleted|STAGE_IX|stageAfter|seatOfActor/.test(bare),
      "the shell reasons about a lifecycle");
    assert(!/\.filter\([^)]*stage\s*!==|\.filter\([^)]*stage\s*===/.test(bare),
      "the shell counts or filters by lifecycle position");
  });

  test("an empty account gets the shell and a sentence, never a crash or a sample", () => {
    const r = show(EMPTY);
    assert(looksLikeCollectorShell(r), "an empty account lost its navigation");
    clickText(r, "Goals");
    assert(/haven't set any goals yet/.test(flat(r)), flat(r));
    assert(/haven't recorded any cards yet/.test(flat(show(EMPTY, "Your Cards"))), "the deferred section");
    clickText(r, "Trusted Partners");
    assert(/no Trusted Partners yet/.test(flat(r)), flat(r));
    const all = flat(r);
    ["Charizard", "Sarah", "Northline", "Example", "Sample", "Lorem"]
      .forEach((n) => assert(!all.includes(n), `sample content: "${n}"`));
    assert(!/undefined|NaN|\[object/.test(all), "something leaked: " + all);
  });

  test("a projection missing collections entirely still renders every section", () => {
    const bare = { actor: { seat: "collector", collectorId: COLLECTOR },
      collectors: [{ id: COLLECTOR, name: "Casey Lin" }] };
    const r = show(bare);
    for (const s of NAV) { clickText(r, s); assert(flat(r).length > 0, `${s} rendered nothing`); }
    assert(flat(r).includes("Casey Lin"));
    /* And ragged rows. */
    const ragged = { ...EMPTY, goals: [null, {}], collectorCopies: "not an array", partners: [null, { id: "p" }] };
    const r2 = show(ragged);
    assert(looksLikeCollectorShell(r2), "a ragged projection took the product down");
    assert(!/\[object Object\]|undefined|NaN/.test(flat(r2)), "something leaked: " + flat(r2));
  });

  test("the whole real Collector projection renders in every section", () => {
    const r = show(REAL);
    assert(looksLikeCollectorShell(r));
    assert(flat(r).includes("Casey Lin"), "the real name: " + flat(r).slice(0, 160));
    for (const s of NAV) { clickText(r, s); assert(flat(r).length > 0, `${s} rendered nothing`); }
    assert(!/\[object Object\]|undefined|NaN/.test(flat(r)));
  });
});

/* ============================================================== D */
describe("D. privacy — a Trusted Partner's figures and another Collector's data", () => {
  test("the real Collector projection carries none of the TP-private fields", () => {
    /* The guarantee is the PROJECTION's, not the screen's. This asserts the
       guarantee holds where it is made, so the screen is a second line and not
       the only one. */
    assert(REAL.inventory.length > 0, "the fixture has no inventory; the test is toothless");
    assert(!REAL.inventory.some((i) => "cost" in i), "a Collector received an acquisition cost");
    assert(!REAL.inventory.some((i) => "acquired" in i), "a Collector received an acquisition date");
    assert(!REAL.relationships.some((r) => "note" in r || "last" in r || "binderReviewedAt" in r),
      "a Collector received a Trusted Partner's private relationship notes");
    eq(REAL.activity.length, 0, "a Collector received partner-private activity");
    eq(REAL.collectors.length, 1, "a Collector received another Collector's record");
    eq(REAL.collectors[0].id, "c12");
  });

  test("and the shell would not render them even if they arrived", () => {
    /* A projection the real server could not produce. If the screen is the only
       thing standing between these and a person, it must still not show them. */
    const leaky = { ...FULL,
      inventory: [{ invId: "i1", partnerId: PARTNER, cardId: "k1", ask: 4200,
        cost: 3100, acquired: "2026-01-11", status: "available" }],
      relationships: [{ partnerId: PARTNER, collectorId: COLLECTOR, status: "accepted", at: "2025-09-03",
        note: "TP-PRIVATE-NOTE-ABOUT-CASEY", last: "2026-08-05", binderReviewedAt: "2026-07-30" }],
      activity: [{ id: "a1", partnerId: PARTNER, text: "TP-PRIVATE-ACTIVITY" }] };
    const r = show(leaky);
    /* Navigate FIRST, then assert — the other way round checks the opening
       section twice and the last one never. */
    for (const s of NAV) {
      clickText(r, s);
      const shown = flat(r);
      ["3100", "$3,100", "2026-01-11", "TP-PRIVATE-NOTE-ABOUT-CASEY", "TP-PRIVATE-ACTIVITY",
        "2026-08-05", "2026-07-30"].forEach((secret) =>
        assert(!shown.includes(secret), `"${secret}" reached a Collector's screen in ${s}: ` + shown));
    }
    /* And the field names are not read anywhere in the Collector surface. */
    const bare = COLLECTOR_FILES.map(code).join("\n");
    ["cost", "acquired", "binderReviewedAt", "activity"].forEach((field) =>
      assert(!new RegExp(`\\b${field}\\b`).test(bare), `the Collector shell reads "${field}"`));
  });

  test("another Collector can never be the person on screen", () => {
    /* WHERE PRIVACY LIVES. The server scopes `goals` and `binder` to one
       Collector before sending them, and a browser that re-filtered by
       `collectorId` would be re-implementing that rule — the thing this
       architecture refuses, and something that would MASK a server bug rather
       than surface it. So a foreign row planted in a collection is not what
       this asserts against.

       What it asserts is the part the browser genuinely owns: another
       Collector's IDENTITY cannot become this one's, by any route. Batch 8's
       own suite adds the join proofs — that a goal's card, a copy's interested
       partners and a partner's relationship all come from the id that row
       carries and never from position or name. */
    const crossed = { ...FULL,
      collectors: [{ id: "c-other", name: "OTHER COLLECTOR" }, { id: COLLECTOR, name: "Casey Lin" }] };
    const r = show(crossed);
    for (const s of NAV) {
      clickText(r, s);
      const shown = flat(r);
      ["OTHER COLLECTOR", "c-other"].forEach((secret) =>
        assert(!shown.includes(secret), `"${secret}" reached the screen in ${s}: ` + shown));
    }
    eq(ACTOR.describeActor(crossed).name, "Casey Lin", "the decoy named the person");
    eq(ACTOR.describeActor(crossed).id, COLLECTOR);
  });

  test("no internal id is ever a label", () => {
    const r = show(REAL);
    for (const s of NAV) {
      clickText(r, s);
      const shown = flat(r);
      ["c12", "p-self", "cc16", "g20", "inv1", "i17"].forEach((id) =>
        assert(!shown.includes(id), `the raw id "${id}" is on screen in ${s}: ` + shown));
    }
  });

  test("privacy is the projection's job, and the shell does not filter", () => {
    const bare = COLLECTOR_FILES.map(code).join("\n");
    /* A shell that filtered by collectorId would be doing the server's job in
       the browser — which is the architecture this project refuses. */
    assert(!/collectorId\s*===|filter\([^)]*collectorId/.test(bare),
      "the shell filters canonical data by collector id");
    assert(!/projectForActor|buildCanonicalSeed|createStore/.test(bare),
      "the shell projects or seeds");
  });
});

/* ============================================================== E */
describe("E. navigation, session and loading", () => {
  test("changing section changes presentation and nothing else", async () => {
    const { r, store, calls } = await signedIn();
    const before = JSON.stringify(store.get());
    const apiCalls = () => calls.filter((c) => c.url.startsWith(APP)).length;
    eq(apiCalls(), 1, "one read, on arrival");

    clickText(r, "Trusted Partners"); await flush(r);
    clickText(r, "Goals"); await flush(r);

    eq(apiCalls(), 1, "moving around asked the server again");
    eq(JSON.stringify(store.get()), before, "navigation changed the projection");
    eq(JSON.stringify(ACTOR.describeActor(store.get())),
      JSON.stringify(ACTOR.describeActor(JSON.parse(before))), "navigation changed the actor");
    assert(looksLikeCollectorShell(r));
  });

  test("the projection handed in is never edited, by any section, ever", () => {
    const r = show(REAL);
    for (const s of NAV) clickText(r, s);
    eq(JSON.stringify(REAL), REAL_PRISTINE, "a section mutated the projection it was given");
  });

  test("sign-out ends the session and clears the Collector's screen", async () => {
    const { r, session, calls } = await signedIn();
    assert(looksLikeCollectorShell(r), "signed in");
    clickText(r, "Sign out"); await flush(r);
    eq(session.status(), SESSION.ANONYMOUS, "the session is over");
    eq(await session.token(), null);
    assert(calls.some((c) => c.url.includes("/logout")), "revoked at the source");
    const shown = flat(r);
    assert(/Sign in with the address/.test(shown), "and the screen is the entrance again: " + shown);
    assert(!shown.includes("Casey Lin"), "with none of the last person on it: " + shown);
    assert(!looksLikeCollectorShell(r), "nor their navigation");
  });

  test("a failed read is a failure, not an empty Collector account", async () => {
    const { r, store } = await signedIn({ view: { status: 503, body: { error: { code: "service_unavailable" } } } });
    assert(!looksLikeCollectorShell(r), "a failed read rendered the product: " + flat(r));
    eq(store.get(), null, "and nothing was invented to stand in for a projection");
    assert(!/haven't set any goals yet/.test(flat(r)), "an empty account was shown instead: " + flat(r));
  });

  test("nothing of either product flashes before the projection arrives", async () => {
    const { session, store } = wire();
    const r = render(React.createElement(SIGNIN.default, { session, store }));
    const seen = [];
    const type = (id, v) => {
      const el = r.root.findAll((n) => n.type === "input" && n.props.id === id)[0];
      TR.act(() => { el.props.onChange({ target: { value: v } }); });
    };
    const submit = () => TR.act(() => {
      r.root.findAll((n) => n.type === "form")[0].props.onSubmit({ preventDefault() {} });
    });
    seen.push(flat(r));
    type("metyet-email", EMAIL); submit(); await flush(r); seen.push(flat(r));
    type("metyet-code", OTP); submit();
    seen.push(flat(r));                                   // before the read resolves
    await flush(r);
    const beforeArrival = seen.join(" ");
    [...NAV, ...TP_NAV, "Casey Lin", "Northline Cards"].forEach((label) =>
      assert(!beforeArrival.includes(label), `"${label}" flashed before the projection arrived`));
    assert(looksLikeCollectorShell(r), "and then it arrived");
  });
});

/* ============================================================== F */
describe("F. no demo, no prototype, no store, no domain", () => {
  test("nothing in the Collector surface reaches any of them", () => {
    assert(COLLECTOR_FILES.length >= 1, "the file list found nothing: " + COLLECTOR_FILES.join(","));
    for (const rel of COLLECTOR_FILES) {
      const bare = code(rel);
      assert(!/from ["'][^"']*domain\/|require\(["'][^"']*domain\//.test(bare), `${rel} imports domain`);
      assert(!/projectForActor|buildCanonicalSeed|createStore|prototypeRuntime|systemRuntime|metyet-commands/.test(bare),
        `${rel} projects, seeds or runs a runtime`);
      assert(!/\bfetch\s*\(|XMLHttpRequest|EventSource|WebSocket/.test(bare), `${rel} reaches the network`);
      assert(!/store\.|session\.|api\.|createApiClient|createProductionStore/.test(bare),
        `${rel} holds a store, a session or an api client`);
      assert(!/MetYetPrototype|MetYetCollector|demo-flag|dev-flag|src\/MetYet|shell\//.test(bare),
        `${rel} reaches the demo or the prototype`);
      /* RESTATED IN BATCH 7, when Goals became the one Collector surface a
         person can change something from. `onSubmit` is a React prop and was
         standing in for "a form, therefore a write"; what must stay true is
         that no file here reaches a WRITE PATH of its own. Everything Goals can
         do arrived as a function in a prop, which every other assertion above
         still holds it to. */
      assert(!/execute\s*\(|\.command\s*\(/.test(bare), `${rel} has a way to write`);
      assert(!/"addGoal"|'addGoal'|"removeGoal"|'removeGoal'|"updateGoalTier"|'updateGoalTier'/.test(bare),
        `${rel} names a command rather than calling the one it was handed`);
    }
  });

  test("the only controls are the three sections and sign out", () => {
    /* RESTATED IN C1. The shell's own chrome is still the sections and sign
       out and nothing else — which is what this test protects. Browse is a
       section with controls INSIDE it (three doorways and a search), so the
       count is taken where the shell's chrome is the whole of what is on
       screen: a section that offers nothing of its own. */
    const labels = buttons(show(REAL, "Trusted Partners")).map(instText);
    eq(labels.length, NAV.length + 1, "an extra control appeared: " + labels.join(" | "));
    assert(labels.some((l) => l.includes("Sign out")));
    /* And Browse's own controls are Browse's, named so a reader can see them. */
    const browsing = buttons(show(REAL)).map(instText);
    eq(browsing.filter((l) => ["Pokémon", "Set", "Artist"].includes(l.trim())).length, 3,
      "the doorways changed: " + browsing.join(" | "));
  });

  test("the production bundle still carries no seed, persona or domain", () => {
    const bundle = esbuild.buildSync({
      entryPoints: [path.join(ROOT, "app-src", "main.jsx")],
      bundle: true, format: "esm", write: false, logLevel: "silent", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"', __METYET_DEV__: "false", __METYET_DEMO__: "false",
        __METYET_API_URL__: '""', __METYET_SUPABASE_URL__: '""', __METYET_SUPABASE_KEY__: '""' },
    }).outputFiles[0].text;
    ["buildCanonicalSeed", "CARDS_SEED", "prototypeRuntime", "projectForActor", "metyet-commands",
      "Switch persona", "Reset demo", "demoDealFixture", "MetYetPrototype", "MetYetCollector",
      "Casey Lin", "Sarah Mendel", "p-self", "c12"]
      .forEach((needle) => assert(!bundle.includes(needle), `the production bundle contains "${needle}"`));
  });
});

/* ============================================================== G */
describe("G. the Trusted Partner and the demo are untouched", () => {
  test("the Trusted Partner workspace still works, end to end", async () => {
    const tp = { ...TP_VIEW,
      collectors: [{ id: "c1", name: "Sarah Mendel", city: "Minneapolis, MN" }],
      relationships: [{ partnerId: PARTNER, collectorId: "c1", status: "accepted", at: "2024-06-02" }],
      catalog: [{ id: "k1", name: "Charizard", set: "Base Set", grade: "PSA 9" }],
      inventory: [{ invId: "i1", partnerId: PARTNER, cardId: "k1", ask: 4200, cost: 3100,
        archived: false, status: "available" }] };
    const { r } = await signedIn({ view: { status: 200, body: { version: 1, state: tp } } });
    assert(looksLikeTpShell(r), "the TP workspace did not render: " + flat(r));
    assert(flat(r).includes("Northline Cards"), "nor its name");
    clickText(r, "Inventory");
    assert(/\$3,100/.test(flat(r)), "the TP's own acquisition cost is still theirs to see: " + flat(r));
  });

  test("the TP surface gained nothing from this batch", () => {
    const tpFiles = fs.readdirSync(path.join(ROOT, "client", "tp"), { withFileTypes: true })
      .flatMap((e) => (e.isDirectory()
        ? fs.readdirSync(path.join(ROOT, "client", "tp", e.name)).map((f) => `client/tp/${e.name}/${f}`)
        : [`client/tp/${e.name}`]));
    for (const rel of tpFiles) {
      assert(!/client\/collector|CollectorShell/.test(code(rel)), `${rel} reaches the Collector app`);
    }
    for (const rel of COLLECTOR_FILES) {
      assert(!/client\/tp|TrustedPartnerShell/.test(code(rel)), `${rel} reaches the TP workspace`);
    }
  });

  test("the demo is untouched and still has no production dependency", () => {
    ["shell/MetYetPrototype.jsx", "src/MetYet.jsx", "collector/MetYetCollector.jsx", "site-src/main.jsx"]
      .forEach((rel) => assert(!/client\/|app-src/.test(code(rel)), `${rel} reaches production`));
    const bundle = esbuild.buildSync({
      entryPoints: [path.join(ROOT, "site-src", "main.jsx")],
      bundle: true, format: "esm", write: false, logLevel: "silent", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"', __METYET_DEV__: "false", __METYET_DEMO__: "true" },
    }).outputFiles[0].text;
    ["supabase", "auth/v1", "Bearer ", "/api/view", "/api/commands", "CollectorShell", "mcs-nav"]
      .forEach((needle) => assert(!bundle.includes(needle), `the demo bundle contains "${needle}"`));
  });

  test("no dependency was added", () => {
    const pkg = JSON.parse(src("package.json"));
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    assert(!Object.keys(all).some((d) => /supabase|axios|swr|react-query|tanstack|router|redux|zustand|mui|chakra/.test(d)),
      "a client library was added");
  });
});

run();
