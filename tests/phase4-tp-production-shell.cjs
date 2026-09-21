/* ============================================================================
   PHASE 4 BATCH 4 — THE TRUSTED PARTNER PRODUCTION SHELL

   Batch 3 proved a real person could get in. What they arrived at was a list of
   collection counts, which proved the round trip and was never the product.
   This batch puts the Trusted Partner application behind that door, and these
   tests are about one question asked six ways: can anything on that screen have
   come from somewhere other than the server's answer?

   Everything below drives the REAL modules — the real auth, session, api
   client, production store, the real <SignIn/>, the real <ProductionApp/> and
   the real <TrustedPartnerShell/> — with one recorded fetch standing in for the
   network. Nothing is reimplemented for the test's convenience.

     A  the seat decides, and only the seat
     B  the shell is the product, and it is the server's data
     C  nothing is invented: identity, rules, or content
     D  the lifecycle still holds: failure, sign-out, and no empty shop
     E  the demo and the production bundle are still different things
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const React = require("react");
const TR = require("react-test-renderer");

const ROOT = path.join(__dirname, "..");
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
/* Source with comments removed: an assertion about what a file DOES must not be
   satisfied — or broken — by prose describing what it does not do. */
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
const APP_MOD = load("client/production-app.jsx");
const SHELL_MOD = load("client/tp/TrustedPartnerShell.jsx");
const ProductionApp = APP_MOD.default;
const Shell = SHELL_MOD.default;

/* Every file the Trusted Partner surface is made of. Batch 5 split the sections
   out of the shell, and an assertion that named one file would have stopped
   covering the code the moment it moved. */
const TP_FILES = fs.readdirSync(path.join(ROOT, "client", "tp"), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory()
    ? fs.readdirSync(path.join(ROOT, "client", "tp", e.name)).map((f) => `client/tp/${e.name}/${f}`)
    : [`client/tp/${e.name}`]));


const PROJECT = "https://projectref.supabase.co";
const KEY = "sb_publishable_example";
const APP = "https://app.metyet.io";
const EMAIL = "owner@northline.example";
const OTP = "24681357";
const ACCESS = "eyJaccess.token.production";
const PARTNER = "p-9k2m";
const COLLECTOR = "c-8x21";

const nowSeconds = () => Math.floor(Date.now() / 1000);
const sessionBody = (inSeconds = 3600) => ({ access_token: ACCESS, refresh_token: "refresh-production",
  token_type: "bearer", expires_in: inSeconds, expires_at: nowSeconds() + inSeconds,
  user: { id: "sub-1", email: EMAIL } });

/* ---------------------------------------------------------------- fixtures

   Built to the shapes domain/metyet-projection.js actually produces — a seat
   with its id under its own field, a `partners` collection holding the actor's
   own record, and rows carrying the SERVER's computed status. A fixture that
   agrees with a bug is how a suite passes while the product is broken, which
   this project has been bitten by once already. */

const EMPTY_TP = Object.freeze({
  actor: { seat: "tp", partnerId: PARTNER },
  catalog: [], collectors: [], partners: [{ id: PARTNER, name: "Northline Cards", since: "2026-09-01" }],
  relationships: [], invitations: [], goals: [], preferences: [], inventory: [], binder: [],
  interests: [], opportunities: [], conversations: [], activity: [], photoRequests: [],
  copyReviews: [], counterparties: [],
});

const FULL_TP = Object.freeze({
  ...EMPTY_TP,
  catalog: [
    { id: "i1", name: "Charizard", set: "Base Set", grade: "PSA 9", num: "4/102" },
    { id: "i2", name: "Blastoise", set: "Base Set", grade: "PSA 8", num: "2/102" },
  ],
  collectors: [{ id: "c1", name: "Sarah Mendel", short: "Sarah M.", city: "Minneapolis, MN" }],
  relationships: [{ partnerId: PARTNER, collectorId: "c1", status: "accepted", at: "2024-06-02" }],
  goals: [{ id: "g0", collectorId: "c1", cardId: "i1", tier: "primary" }],
  binder: [{ id: "cc0", collectorId: "c1", cardId: "i2", status: "available" }],
  /* `status` is the server's answer. The second row is SOLD while no
     opportunity references it — a client that recomputed the rule would
     disagree, which is exactly what the test below is for. */
  inventory: [
    { invId: "inv1", partnerId: PARTNER, cardId: "i1", ask: 4200, archived: false, status: "available" },
    { invId: "inv2", partnerId: PARTNER, cardId: "i2", ask: 900, archived: false, status: "sold" },
    { invId: "inv3", partnerId: PARTNER, cardId: "i2", ask: 700, archived: true, status: "available" },
  ],
  opportunities: [
    { id: "o0", collectorId: "c1", cardId: "i1", partnerId: PARTNER, stage: "agree-price", listedPrice: 4200 },
    { id: "o1", collectorId: "c1", cardId: "i2", partnerId: PARTNER, stage: "completed", listedPrice: 900 },
  ],
});

const COLLECTOR_VIEW = Object.freeze({
  ...EMPTY_TP,
  actor: { seat: "collector", collectorId: COLLECTOR },
  partners: [],
  collectors: [{ id: COLLECTOR, name: "Casey Lin" }],
});

/* ------------------------------------------------------------- the network */

function wire({ otp = { status: 200, body: {} }, verify = { status: 200, body: sessionBody() },
  view = { status: 200, body: { version: 7, state: FULL_TP } }, logout = { status: 204, body: {} } } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, method: (init && init.method) || "GET", headers: (init && init.headers) || {},
      body: init && init.body ? JSON.parse(init.body) : undefined });
    const reply = url.includes("/auth/v1/otp") ? otp
      : url.includes("/auth/v1/verify") ? verify
        : url.includes("/auth/v1/logout") ? logout
          : url.includes("/auth/v1/token") ? verify
            : view;
    if (reply instanceof Error) throw reply;
    return { status: reply.status, async json() { return reply.body; } };
  };
  const auth = AUTH.createSupabaseAuth({ supabaseUrl: PROJECT, publishableKey: KEY, fetchImpl: impl });
  const session = SESSION.createSupabaseSession({ auth });
  const api = API.createApiClient({ baseUrl: APP, getToken: () => session.token(), fetchImpl: impl });
  const store = STORE.createProductionStore({ api });
  return { calls, session, store,
    apiCalls: () => calls.filter((c) => c.url.startsWith(APP)) };
}

/* --------------------------------------------------------------- rendering */

const render = (element) => {
  let r;
  TR.act(() => { r = TR.create(element); });
  return r;
};
const flush = async (r) => { await TR.act(async () => { await new Promise((res) => setTimeout(res, 0)); }); return r; };
/* The text a person would READ. A <style> element's child is a string too, and
   Batch 5's stylesheet is long enough that any assertion about what is or is
   not on screen would start matching CSS — `--sidebar` is not a word anybody
   sees. Skipping style content is what makes every text assertion below mean
   what it says. */
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
const buttons = (r) => r.root.findAll((n) => n.type === "button");
/* The text a rendered node actually shows. Reading `props.children` instead
   works only while children are strings; the shell nests them in spans, and
   JSON.stringify on a React element walks into the fiber and never returns. */
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
const clickText = (r, label) => {
  const button = buttons(r).find((n) => instText(n).includes(label));
  assert(button, `no button "${label}" among: ${buttons(r).map(instText).join(" | ")}`);
  TR.act(() => { button.props.onClick(); });
};
const hasButton = (r, label) => buttons(r).some((n) => instText(n).includes(label));

/* Signs in for real, all the way through to whatever the seat renders. */
const signedIn = async (opts) => {
  const w = wire(opts);
  const r = render(React.createElement(SIGNIN.default, { session: w.session, store: w.store }));
  const typeInto = (id, value) => {
    const input = r.root.findAll((n) => n.type === "input" && n.props.id === id)[0];
    assert(input, `no input ${id}`);
    TR.act(() => { input.props.onChange({ target: { value } }); });
  };
  const submit = () => {
    const form = r.root.findAll((n) => n.type === "form")[0];
    assert(form, "no form to submit");
    TR.act(() => { form.props.onSubmit({ preventDefault() {} }); });
  };
  typeInto("metyet-email", EMAIL); submit(); await flush(r);
  typeInto("metyet-code", OTP); submit(); await flush(r);
  return { ...w, r };
};

/* THREE, AND THREE ONLY. Phase 5 Batch 1 briefly gave the shop profile a
   destination of its own; the hosted review judged that too much navigation
   weight for context that is not recurring work, and it moved behind
   Inventory's "View shop". Top-level navigation is for what a Trusted Partner
   opens MetYet to do. */
const TP_NAV = ["Collector Network", "Inventory", "Opportunities"];
const looksLikeTpShell = (r) => TP_NAV.every((label) => hasButton(r, label));

/* ============================================================== A */
describe("A. the seat decides, and only the seat", () => {
  test("a Trusted Partner actor renders the Trusted Partner shell", async () => {
    const { r } = await signedIn();
    assert(looksLikeTpShell(r), "the TP navigation is not on screen: " + flat(r));
    assert(flat(r).includes("Collector Network"), "and its first section");
    assert(flat(r).includes("Who you're serving"), "with the product's own subtitle");
  });

  test("a Collector actor never reaches the Trusted Partner shell", async () => {
    const { r } = await signedIn({ view: { status: 200, body: { version: 1, state: COLLECTOR_VIEW } } });
    assert(!looksLikeTpShell(r), "a Collector was shown the TP shell: " + flat(r));
    const shown = flat(r);
    /* Batch 7 gave the Collector their own application. Until then this seat
       reached a truthful "not in this release" notice; the assertion that
       mattered was never the wording but that a Collector does NOT get the
       Trusted Partner workspace, and that is unchanged and still first. */
    /* Restated in Batch 8.1: the Trade Binder left the Collector's navigation
       until a Collector can put a card in one. What this asserts is unchanged —
       a Collector gets the Collector app, whole. */
    ["Goals", "Trusted Partners"].forEach((label) => {
      assert(hasButton(r, label), `the Collector app is missing ${label}: ` + shown);
    });
    assert(!/Collector Network|Inventory/.test(shown), "a TP section leaked into it: " + shown);
    assert(hasButton(r, "Sign out"), "with a way out");
  });

  test("an actor with no seat at all fails closed", () => {
    const r = render(React.createElement(ProductionApp, { state: { ...EMPTY_TP, actor: null } }));
    assert(!looksLikeTpShell(r), "no seat rendered a product surface");
    assert(/couldn't tell which account/.test(flat(r)), flat(r));
    assert(!flat(r).includes("Northline Cards"), "and named nobody");
  });

  test("a seat this build does not know fails closed, rather than defaulting", () => {
    for (const seat of ["operator", "admin", "TP", "tp ", ""]) {
      const state = { ...EMPTY_TP, actor: { seat, partnerId: PARTNER } };
      const r = render(React.createElement(ProductionApp, { state }));
      assert(!looksLikeTpShell(r), `seat "${seat}" reached the TP shell`);
      assert(hasButton(r, "Sign out"), `seat "${seat}" left no way out`);
      /* And the reading itself refuses, not only the router. A word this table
         does not contain is not a near-miss for one that it does: defaulting an
         unknown seat to `tp` would hand it the partner id field, a name, and a
         plausible-looking identity for the next caller to trust. */
      const who = ACTOR.describeActor(state);
      eq(who.seat, null, `seat "${seat}" was read as a seat`);
      eq(who.id, null, `seat "${seat}" was given an id`);
      eq(who.name, null, `seat "${seat}" was given a name`);
      eq(ACTOR.isIdentified(who), false, `seat "${seat}" counted as identified`);
    }
  });

  test("a seat with no id under its own field fails closed", () => {
    for (const actor of [{ seat: "tp" }, { seat: "tp", partnerId: "" }, { seat: "tp", partnerId: "  " },
      { seat: "tp", partnerId: 7 }, { seat: "tp", id: PARTNER }]) {
      const r = render(React.createElement(ProductionApp, { state: { ...EMPTY_TP, actor } }));
      assert(!looksLikeTpShell(r), `${JSON.stringify(actor)} reached the TP shell`);
    }
    /* `actor.id` is the shape that does NOT exist, and must not become one. */
    eq(ACTOR.describeActor({ ...EMPTY_TP, actor: { seat: "tp", id: PARTNER } }).id, null,
      "an `actor.id` is not read as an identity");
  });

  test("the router reads the seat and nothing else can carry one in", () => {
    const bare = code("client/production-app.jsx");
    assert(/describeActor\(state\)/.test(bare), "the seat comes from the projection");
    assert(!/(partnerId|collectorId|seat)\s*:\s*["'`]/.test(bare), "the router assigns a literal seat or id");
    assert(!/localStorage|sessionStorage|document\.cookie|location\.(search|hash|pathname)/.test(bare),
      "the router reads identity from storage or the URL");
    assert(!/email|token|subject/i.test(bare), "the router looks at a credential or an address");
    /* Every branch ends in a render; the LAST one must be the refusal, so a
       seat added to the domain later and forgotten here cannot fall through
       into somebody else's product.

       This is a shape assertion and is honest about being one: today the
       branch is UNREACHABLE, because client/actor.js already collapses an
       unrecognised seat to nobody, which the first branch refuses. It is
       defence in depth, and the point of asserting it is that it stays
       defence rather than quietly becoming a fall-through.

       It reads the file's LAST return, not the last one after some anchor —
       an earlier `<Plain>` in the Collector branch would otherwise satisfy it
       no matter what the final branch became. */
    const lastReturn = bare.slice(bare.lastIndexOf("return"));
    assert(/^return \(\s*<Plain/.test(lastReturn.trim()),
      "the default branch is not the refusal: " + lastReturn.slice(0, 160));
  });
});

/* ============================================================== B */
describe("B. the shell is the product, and all of it is the server's data", () => {
  test("the established navigation, in the product's own order", () => {
    const r = render(React.createElement(Shell, { state: FULL_TP }));
    const labels = buttons(r).map(instText).filter((s) => TP_NAV.some((n) => s.includes(n)));
    eq(labels.length, 3, "three sections, no more");
    TP_NAV.forEach((n, i) => assert(labels[i].includes(n), `section ${i} is not ${n}`));
    eq(SHELL_MOD.SECTIONS.map((s) => s.id).join(","), "collectors,inventory,opportunities");
    /* And the profile is not one of them, by name or by id. */
    assert(!/Shop Profile/.test(flat(r)), "Shop Profile is still a destination: " + flat(r));
    assert(!SHELL_MOD.SECTIONS.some((s) => s.id === "profile"),
      "a profile section survived as a reachable id");
    /* WHICH SECTIONS CAN CHANGE ANYTHING IS A FACT ABOUT THE BUILD, and it
       moves as the product grows: Batch 1 had only the shop profile, behind
       Inventory; Batch 2 added inviting a collector, which belongs on the
       Collector Network because that is what a network grows from. Naming the
       exact list is what keeps that growth deliberate — a section that quietly
       acquires a write has to come through here. Opportunities is still read
       only, and that is the assertion with teeth. */
    eq(SHELL_MOD.SECTIONS.filter((s) => s.writes).map((s) => s.id).join(","),
      "collectors,inventory");
    assert(!SHELL_MOD.SECTIONS.find((s) => s.id === "opportunities").writes,
      "Opportunities acquired a write without a decision");
  });

  test("the counts beside each section are the projection's own rows", () => {
    const r = render(React.createElement(Shell, { state: FULL_TP }));
    const shown = flat(r);
    assert(/Collector Network 1/.test(shown), "collectors: " + shown);
    /* Two live copies of three: the archived one is not stock. */
    assert(/Inventory 2/.test(shown), "inventory: " + shown);
    /* One of two opportunities is completed, so one is in progress. */
    assert(/Opportunities 1/.test(shown), "opportunities: " + shown);
  });

  test("each section renders the rows the server sent", () => {
    const r = render(React.createElement(Shell, { state: FULL_TP }));
    assert(flat(r).includes("Sarah Mendel"), "the collector");
    assert(flat(r).includes("Minneapolis, MN"), "and what the projection says about them");

    clickText(r, "Inventory");
    const inv = flat(r);
    assert(inv.includes("Charizard") && inv.includes("Base Set"), "the copies: " + inv);
    assert(inv.includes("$4,200"), "with the ask as money: " + inv);
    assert(!inv.includes("inv3") && !/\$700/.test(inv), "an archived copy is not stock: " + inv);

    clickText(r, "Opportunities");
    const opp = flat(r);
    assert(opp.includes("Agree on Price"), "the stage, with the product's label: " + opp);
    /* Batch 5 lists completed work in its OWN panel rather than dropping it, so
       "not in progress" is now a statement about WHERE it appears, not about
       whether it appears at all. Asserting its total absence would have been
       satisfied by a screen that lost it. */
    const inProgress = opp.slice(opp.indexOf("In progress"), opp.indexOf("Completed"));
    assert(inProgress.includes("Charizard"), "the active deal is in progress: " + inProgress);
    assert(!inProgress.includes("Blastoise"), "a completed deal is in progress: " + inProgress);
    assert(/Completed[\s\S]*Blastoise/.test(opp), "and completed work is still accounted for: " + opp);
  });

  test("a copy's status is the server's answer, not one worked out here", () => {
    /* inv2 is SOLD, and no opportunity in the projection references it. Any
       client that re-derived the rule from `opportunities` would call it
       Available. The shell reads the row. */
    const r = render(React.createElement(Shell, { state: FULL_TP }));
    clickText(r, "Inventory");
    assert(/Sold/.test(flat(r)), "the server's status was overruled: " + flat(r));
    /* Batch 5 moved the section bodies into client/tp/sections/, so the
       assertion follows the code. Every file under client/tp/ is scanned, not
       just the one that used to hold it. */
    const everything = TP_FILES.map(code).join("\n");
    assert(/\.status\b/.test(everything), "the status is read from the row");
    assert(!/isCompleted|soldInventoryIds|inventoryCopyStatus|binderCopyStatus/.test(everything),
      "the shell re-derives a canonical rule");
  });

  test("a stage the client has never heard of is shown, not guessed at", () => {
    const state = { ...FULL_TP,
      opportunities: [{ id: "oX", collectorId: "c1", cardId: "i1", stage: "renegotiation" }] };
    const r = render(React.createElement(Shell, { state }));
    clickText(r, "Opportunities");
    const shown = flat(r);
    assert(shown.includes("renegotiation"), "an unknown stage vanished: " + shown);
    assert(!/Agree on Price|Deal\b/.test(shown), "and was guessed into a known one: " + shown);
  });

  test("navigating the shell asks the server for nothing", async () => {
    const { r, apiCalls } = await signedIn();
    eq(apiCalls().length, 1, "one read, on arrival");
    clickText(r, "Inventory"); await flush(r);
    clickText(r, "Opportunities"); await flush(r);
    clickText(r, "Collector Network"); await flush(r);
    eq(apiCalls().length, 1, "moving around the product re-asked the server");
    assert(looksLikeTpShell(r), "and it is still the shell");
  });
});

/* ============================================================== C */
describe("C. nothing is invented — not identity, not rules, not content", () => {
  test("the shop's name comes from the actor's own projected record", async () => {
    const { r } = await signedIn();
    assert(flat(r).includes("Northline Cards"), "the name from `partners`: " + flat(r));
  });

  test("another partner's record cannot rename the person signed in", () => {
    /* The decoy is FIRST, so `partners[0]` — the convenient reading — is wrong. */
    const state = { ...EMPTY_TP, partners: [
      { id: "p-decoy", name: "Someone Else Cards" },
      { id: PARTNER, name: "Northline Cards" },
    ] };
    const r = render(React.createElement(Shell, { state }));
    const shown = flat(r);
    assert(shown.includes("Northline Cards"), "the actor's own record: " + shown);
    assert(!shown.includes("Someone Else Cards"), "a decoy record was used: " + shown);
    eq(ACTOR.describeActor(state).name, "Northline Cards");
    eq(ACTOR.describeActor(state).id, PARTNER);
  });

  test("a partner the server did not name is not given a name", () => {
    const state = { ...EMPTY_TP, partners: [] };
    const r = render(React.createElement(Shell, { state }));
    const shown = flat(r);
    assert(!shown.includes("Northline"), "a name was invented: " + shown);
    assert(!shown.includes(PARTNER), "or an id shown in its place: " + shown);
    eq(ACTOR.describeActor(state).name, null);
  });

  test("the internal id is not the person's identity on screen", async () => {
    const { r } = await signedIn();
    assert(!flat(r).includes(PARTNER), "the raw partner id is on screen: " + flat(r));
    assert(!/\bc1\b|\binv1\b|\bo0\b/.test(flat(r)), "and so are other internal ids: " + flat(r));
  });

  test("the shell has no store, no session, no api and no domain", () => {
    for (const rel of [...TP_FILES, "client/production-app.jsx", "client/actor.js"]) {
      const bare = code(rel);
      assert(!/from ["'][^"']*domain\/|require\(["'][^"']*domain\//.test(bare), `${rel} imports domain`);
      assert(!/projectForActor|buildCanonicalSeed|createStore|prototypeRuntime|systemRuntime/.test(bare),
        `${rel} projects, seeds or runs a runtime`);
      assert(!/\bfetch\s*\(|XMLHttpRequest|EventSource|WebSocket/.test(bare), `${rel} reaches the network`);
      assert(!/store\.|session\.|api\.|createApiClient|createProductionStore/.test(bare),
        `${rel} holds a store, a session or an api client`);
      assert(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(bare), `${rel} persists something`);
    }
  });

  /* PHASE 5 BATCH 1 CHANGED WHAT THIS ASSERTS, AND NOT WHY IT EXISTS. It used
     to say the shell cannot change anything. One section can now, so the rule
     that survives is the one that always mattered: the shell still cannot
     REACH a mutation itself. It holds no store, spells no command and does not
     go to the network — what it has is a callback handed in from outside. And
     the three sections that still change nothing still say so. */
  test("the shell reaches a mutation only through a callback, never by itself", () => {
    const bare = TP_FILES.map(code).join("\n");
    assert(!/execute\s*\(|\.command\s*\(|POST|updatePartnerProfile|inviteCollector|revokeCollectorInvitation/
      .test(bare), "the shell reaches a command path by itself");
    /* The callbacks it is handed instead — one per thing this build can change. */
    assert(/onSave/.test(bare), "the profile callback it is handed instead is missing");
    assert(/onInvite/.test(bare) && /onRevokeInvite/.test(bare),
      "the invitation callbacks it is handed instead are missing");

    /* HANDED NOTHING, IT OFFERS NOTHING. This render passes no callback at all,
       and that — not a notice — is what makes a surface unable to change
       anything: three sections and sign-out, on the section that in production
       carries the most controls. */
    const r = render(React.createElement(Shell, { state: FULL_TP }));
    const labels = buttons(r).map(instText);
    eq(labels.length, 4, "an extra control appeared: " + labels.join(" | "));
    assert(!/Invite a collector|Withdraw/.test(flat(r)),
      "an invitation control was offered with no way to send it: " + flat(r));

    /* A section nothing can be changed from still says so. Opportunities is the
       one left, and the notice belongs to it rather than to the shell. */
    clickText(r, "Opportunities");
    assert(/Read-only for now/.test(flat(r)), "a read section does not say it is read-only");

    /* Inventory is where the shop is reached from, so it does not carry a
       notice contradicting what can be done there.

       THE SENTENCE IT USED TO CARRY WAS "Adding and editing copies arrive in a
       later release", and Batch 6 is that release — a Trusted Partner can add a
       copy now, so a promise that they cannot would be false. What is still
       true, and is what this test was really protecting, is that the section
       offers nothing it cannot deliver: this render is given no `onAddCopy`,
       and with no callback there is no way to add. */
    clickText(r, "Inventory");
    assert(!/Read-only for now/.test(flat(r)), "Inventory still claims the whole section is read-only");
    assert(!/Adding and editing copies arrive in a later release/.test(flat(r)),
      "Inventory still promises that copies cannot be added: " + flat(r));
    assert(!/Add a copy/.test(flat(r)),
      "a way to add a copy was offered with no callback to add one: " + flat(r));
    assert(buttons(r).some((b) => instText(b).includes("View shop")), "Inventory has no way to the shop");
  });

  test("without a callback the shop view offers no control at all", () => {
    const r = render(React.createElement(Shell, { state: FULL_TP }));
    clickText(r, "Inventory");
    clickText(r, "View shop");
    const labels = buttons(r).map(instText);
    assert(!labels.some((l) => /Edit profile/.test(l)),
      "Edit was offered with no way to save: " + labels.join(" | "));
    /* And the way back is always there. */
    assert(labels.some((l) => /Back to inventory/.test(l)), labels.join(" | "));
  });

  test("the shop view is reached from Inventory, and returns to it", () => {
    const r = render(React.createElement(Shell, { state: FULL_TP, onSaveProfile: () => {} }));
    clickText(r, "Inventory");
    assert(/Your copies/.test(flat(r)), "Inventory did not open on the copies");
    clickText(r, "View shop");
    const shop = flat(r);
    assert(/Your shop/.test(shop), "the shop view did not open: " + shop);
    assert(!/Your copies/.test(shop), "the copies are still on screen behind it");
    assert(buttons(r).some((b) => instText(b).includes("Edit profile")), "no way to edit from the shop");
    clickText(r, "Back to inventory");
    assert(/Your copies/.test(flat(r)), "there is no way back to the copies");
    /* And leaving the section resets it: Inventory opens on the copies. */
    clickText(r, "Opportunities");
    clickText(r, "Inventory");
    assert(/Your copies/.test(flat(r)), "Inventory reopened on the shop rather than the shelf");
  });

  test("an empty account renders sentences, never sample content", () => {
    const r = render(React.createElement(Shell, { state: EMPTY_TP }));
    assert(looksLikeTpShell(r), "an empty account lost its navigation");
    const one = flat(r);
    assert(/No collectors in your network yet/.test(one), one);
    assert(/Collector Network 0/.test(one), "and the count is nought: " + one);

    clickText(r, "Inventory");
    assert(/Nothing in your inventory yet/.test(flat(r)), flat(r));
    clickText(r, "Opportunities");
    assert(/Nothing in progress yet/.test(flat(r)), flat(r));

    /* Nothing from the demo seed, and nothing plausible-looking, anywhere. */
    const all = flat(r);
    ["Sarah", "Charizard", "Casey", "Northline Cards, Duluth", "Example", "Sample", "Lorem"]
      .forEach((needle) => assert(!all.includes(needle), `sample content: "${needle}" in ${all}`));
    assert(all.includes("Northline Cards"), "though the shop's own name is still its own");
  });

  test("a projection missing whole collections is an ordinary case", () => {
    /* A server that answers with less than the full set — an older build, a
       narrowed projection — must not crash the application. */
    const r = render(React.createElement(Shell, { state: { actor: { seat: "tp", partnerId: PARTNER } } }));
    assert(looksLikeTpShell(r), "a sparse projection took the product down");
    clickText(r, "Inventory");
    clickText(r, "Opportunities");
    assert(flat(r).length > 0, "and it still renders");
    /* And so must a row that is not the shape anything expected. */
    const ragged = { ...EMPTY_TP, collectors: [null, { id: "c9" }], inventory: [{ invId: "x" }],
      opportunities: [{ id: "o9" }], catalog: [null] };
    const r2 = render(React.createElement(Shell, { state: ragged }));
    assert(looksLikeTpShell(r2), "a ragged projection took the product down");
  });
});

/* ============================================================== D */
describe("D. the lifecycle still holds around the new shell", () => {
  test("the seven states are unchanged, and lead to the product", async () => {
    const { session, store } = wire();
    const r = render(React.createElement(SIGNIN.default, { session, store }));
    assert(/Sign in with the address/.test(flat(r)), "signed out");
    const input = (id, value) => {
      const el = r.root.findAll((n) => n.type === "input" && n.props.id === id)[0];
      TR.act(() => { el.props.onChange({ target: { value } }); });
    };
    const submit = () => {
      const form = r.root.findAll((n) => n.type === "form")[0];
      TR.act(() => { form.props.onSubmit({ preventDefault() {} }); });
    };
    input("metyet-email", EMAIL); submit(); await flush(r);
    assert(flat(r).includes("We sent a code to"), "code sent");
    input("metyet-code", OTP); submit(); await flush(r);
    assert(looksLikeTpShell(r), "and then the product");
    eq(SIGNIN.STATES.ready, "ready", "the state names did not change");
  });

  test("an API failure is a failure, not an empty shop", async () => {
    const { r, store } = await signedIn({ view: { status: 503, body: { error: { code: "service_unavailable" } } } });
    assert(!looksLikeTpShell(r), "a failed read rendered the product: " + flat(r));
    assert(/MetYet could not be reached|went wrong/.test(flat(r)), flat(r));
    eq(store.get(), null, "and nothing was invented to stand in for a projection");
    assert(!/Collector Network 0|Nothing in your inventory/.test(flat(r)),
      "an empty shop was shown instead of a failure: " + flat(r));
  });

  test("a verified sign-in that is nobody in MetYet says so, and shows no product", async () => {
    const { r } = await signedIn({ view: { status: 403, body: { error: { code: "account_not_provisioned" } } } });
    assert(!looksLikeTpShell(r), "an unprovisioned account reached the product");
    assert(/not a MetYet account yet/.test(flat(r)), flat(r));
    assert(/invitation/i.test(flat(r)), "and is pointed at the one thing that makes one");
  });

  test("sign-out from inside the shell clears the session and the screen", async () => {
    const { r, session, calls } = await signedIn();
    assert(looksLikeTpShell(r), "signed in");
    clickText(r, "Sign out"); await flush(r);
    eq(session.status(), SESSION.ANONYMOUS, "the session is over");
    eq(await session.token(), null);
    assert(calls.some((c) => c.url.includes("/logout")), "revoked at the source");
    const shown = flat(r);
    assert(/Sign in with the address/.test(shown), "and the screen is the entrance again: " + shown);
    assert(!shown.includes("Northline Cards") && !shown.includes("Sarah Mendel"),
      "with none of the last person's shop on it: " + shown);
    assert(!looksLikeTpShell(r), "nor its navigation");
  });

  test("the next person's failed sign-in cannot show the last person's shop", async () => {
    let viewReply = { status: 200, body: { version: 7, state: FULL_TP } };
    const calls = [];
    const impl = async (url) => {
      calls.push({ url });
      const reply = url.includes("/auth/v1/otp") ? { status: 200, body: {} }
        : url.includes("/auth/v1/verify") ? { status: 200, body: sessionBody() }
          : url.includes("/auth/v1/logout") ? { status: 204, body: {} }
            : viewReply;
      return { status: reply.status, async json() { return reply.body; } };
    };
    const auth = AUTH.createSupabaseAuth({ supabaseUrl: PROJECT, publishableKey: KEY, fetchImpl: impl });
    const session = SESSION.createSupabaseSession({ auth });
    const api = API.createApiClient({ baseUrl: APP, getToken: () => session.token(), fetchImpl: impl });
    const store = STORE.createProductionStore({ api });
    const r = render(React.createElement(SIGNIN.default, { session, store }));
    const input = (id, value) => {
      const el = r.root.findAll((n) => n.type === "input" && n.props.id === id)[0];
      TR.act(() => { el.props.onChange({ target: { value } }); });
    };
    const submit = () => {
      const form = r.root.findAll((n) => n.type === "form")[0];
      TR.act(() => { form.props.onSubmit({ preventDefault() {} }); });
    };
    input("metyet-email", EMAIL); submit(); await flush(r);
    input("metyet-code", OTP); submit(); await flush(r);
    assert(flat(r).includes("Sarah Mendel"), "somebody's shop is on screen");

    clickText(r, "Sign out"); await flush(r);
    viewReply = { status: 503, body: { error: { code: "service_unavailable" } } };
    input("metyet-email", "someone.else@example.com"); submit(); await flush(r);
    input("metyet-code", OTP); submit(); await flush(r);
    const shown = flat(r);
    assert(!shown.includes("Northline Cards"), "the previous shop reappeared: " + shown);
    assert(!shown.includes("Sarah Mendel"), "and so did its network: " + shown);
    assert(!looksLikeTpShell(r), "and its navigation: " + shown);
  });

  test("no credential is rendered anywhere in the product", async () => {
    const { r } = await signedIn();
    const shown = texts(r);
    [ACCESS, "refresh-production", OTP, KEY, "Bearer"].forEach((secret) => {
      assert(!shown.includes(secret), `"${secret.slice(0, 10)}…" reached the screen`);
    });
  });
});

/* ============================================================== E */
describe("E. the demo and the production bundle are still different things", () => {
  const productionBundle = () => esbuild.buildSync({
    entryPoints: [path.join(ROOT, "app-src", "main.jsx")],
    bundle: true, format: "esm", write: false, logLevel: "silent", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"', __METYET_DEV__: "false", __METYET_DEMO__: "false",
      __METYET_API_URL__: '""', __METYET_SUPABASE_URL__: '""', __METYET_SUPABASE_KEY__: '""' },
  }).outputFiles[0].text;

  test("no seed, no persona, no scenario and no domain reaches production", () => {
    const bundle = productionBundle();
    ["buildCanonicalSeed", "CARDS_SEED", "PARTNERS_SEED", "prototypeRuntime", "projectForActor",
      "Switch persona", "Reset demo", "demoDealFixture", "MetYetPrototype", "MetYetCollector",
      "Northline Cards", "Sarah Mendel", "Casey Lin", "p-self", "Pilot workspace"]
      .forEach((needle) => assert(!bundle.includes(needle), `the production bundle contains "${needle}"`));
  });

  test("the production entry graph reaches neither the demo nor the prototype", () => {
    ["client/actor.js", "client/production-app.jsx", "client/tp/TrustedPartnerShell.jsx",
      "client/sign-in/SignIn.jsx", "app-src/main.jsx"].forEach((rel) => {
      const bare = code(rel);
      assert(!/MetYetPrototype|MetYetCollector|demo-flag|dev-flag|site-src/.test(bare), `${rel} reaches the demo`);
      /* The PROTOTYPE's paths, named exactly. `collector/` alone was a proxy for
         `collector/MetYetCollector.jsx`, and Batch 7 put a production file at
         `client/collector/CollectorShell.jsx` — which the proxy flagged and the
         rule never meant. Naming the three prototype entry points keeps the
         assertion while removing the false positive. */
      assert(!/src\/MetYet|shell\/MetYetPrototype|collector\/MetYetCollector/.test(bare),
        `${rel} imports the prototype`);
      assert(!/__METYET_DEMO__|__METYET_DEV__/.test(bare), `${rel} reads a demo switch`);
    });
  });

  test("the demo never acquired a production dependency", () => {
    ["shell/MetYetPrototype.jsx", "src/MetYet.jsx", "collector/MetYetCollector.jsx", "site-src/main.jsx"]
      .forEach((rel) => assert(!/client\/|app-src/.test(code(rel)), `${rel} reaches production`));
    const bundle = esbuild.buildSync({
      entryPoints: [path.join(ROOT, "site-src", "main.jsx")],
      bundle: true, format: "esm", write: false, logLevel: "silent", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"', __METYET_DEV__: "false", __METYET_DEMO__: "true" },
    }).outputFiles[0].text;
    ["supabase", "auth/v1", "Bearer ", "refresh_token", "/api/view", "/api/commands", "metyet-email"]
      .forEach((needle) => assert(!bundle.includes(needle), `the demo bundle contains "${needle}"`));
  });

  test("no dependency was added for any of this", () => {
    const pkg = JSON.parse(src("package.json"));
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    assert(!Object.keys(all).some((d) => /supabase|axios|swr|react-query|tanstack|router|redux|zustand/.test(d)),
      "a client library was added");
    assert(all.react && all["react-dom"], "React was already a dependency");
  });
});

run();
