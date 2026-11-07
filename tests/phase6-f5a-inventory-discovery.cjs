/* ============================================================================
   PHASE 6 P6-F5A — TRUSTED PARTNER INVENTORY IN BROWSE
   A Collector browsing an exact printing can see whether a CONNECTED shop has
   it AVAILABLE — and nothing else. The rule is the projection's (the same as
   /api/view): connected partners only, never an archived copy, only a copy
   whose status for this Collector is `available`. The server applies it; the
   client only draws it.
     A. the server's filter   At my shops pages and searches in SQL, from the
                              actor's own projection; nothing in a request
                              can widen it; a partner gets none
     B. it follows the world  removals, a Collector's own deal, price and
                              firmness changes
     C. the grid              the indicator only where something is available;
                              the filter is a server flag, not a client sieve
     D. the card              each available copy: shop, printing, grading,
                              Proposed Market Price, Open to Offers / Firm
     E. looking is looking    no Goal, no opportunity, no write of any kind
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const path = require("path");
const esbuild = require("esbuild");
const React = require("react");
const TR = require("react-test-renderer");

/* The UI checks need a window; the server checks must not see a fake one,
   so it is made only when the first UI check starts (they run after). */
const stubWindow = () => { if (!global.window) global.window = { addEventListener() {}, removeEventListener() {}, scrollTo() {} }; };

const ROOT = path.join(__dirname, "..");
const json = (v) => JSON.stringify(v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = async () => { for (let i = 0; i < 8; i += 1) await TR.act(async () => { await sleep(0); }); };
const textOf = (n) => (typeof n === "string" ? n : !n || !n.children ? "" : n.children.map(textOf).join(" "));
const flat = (n) => textOf(n).replace(/\s+/g, " ").trim();
const cls = (n) => String((n.props && n.props.className) || "");
const load = (rel) => {
  const out = esbuild.buildSync({ entryPoints: [path.join(ROOT, rel)], bundle: true, format: "cjs",
    write: false, logLevel: "silent", jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"], define: { "process.env.NODE_ENV": '"production"' } });
  const mod = { exports: {} };
  new Function("module", "exports", "require", out.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
};

/* ============================================================== A, B, E */
let ctx = null;
const world = async () => { if (!ctx) ctx = await require("../harness/phase6-world.cjs").serve(); return ctx; };
const get = async (who, u) => { const c = await world(); const r = await fetch(c.url + u, { headers: { authorization: `Bearer ${who}` } }); return { status: r.status, body: await r.json() }; };
const names = (b) => b.contexts.map((c) => `${c.cardName} ${c.expansionName} #${c.collectorNumber}`).sort();

describe("A. At my shops, on the server", () => {
  test("Casey's shops: exactly the cards Northline (connected) has available — not Faraway's, not the archived one", async () => {
    const r = await get("casey", "api/card-contexts?atMyShops=1");
    eq(r.status, 200);
    eq(json(names(r.body)), json(["Charizard Base Set #4", "Mudkip Ruby & Sapphire #60"]));
    eq(r.body.total, 2);
  });
  test("it composes with search, Pokémon and number like any other constraint", async () => {
    eq(json(names((await get("casey", "api/card-contexts?atMyShops=1&query=mudkip")).body)), json(["Mudkip Ruby & Sapphire #60"]));
    eq((await get("casey", "api/card-contexts?atMyShops=1&pokedex=25")).body.total, 0, "Faraway's Pikachu leaked through a Pokémon filter");
    eq(json(names((await get("casey", "api/card-contexts?atMyShops=1&number=4")).body)), json(["Charizard Base Set #4"]));
  });
  test("it pages in the database: two pages of one, nothing missed, nothing repeated", async () => {
    const p1 = (await get("casey", "api/card-contexts?atMyShops=1&pageSize=1&page=1")).body;
    const p2 = (await get("casey", "api/card-contexts?atMyShops=1&pageSize=1&page=2")).body;
    eq(json([p1.total, p2.total, p1.contexts.length, p2.contexts.length]), json([2, 2, 1, 1]));
    assert(p1.contexts[0].cardContextId !== p2.contexts[0].cardContextId);
  });
  test("nothing in a request widens it: partner ids, card ids and seats are ignored", async () => {
    for (const extra of ["&partnerId=p-far", "&canonicalCardIds=x,y", "&seat=tp", "&collectorId=c2", "&atMyShops=1"]) {
      eq(json(names((await get("casey", `api/card-contexts?atMyShops=1${extra}`)).body)), json(["Charizard Base Set #4", "Mudkip Ruby & Sapphire #60"]), extra);
    }
  });
  test("a Trusted Partner asking 'at my shops' gets nothing; without the flag the catalogue is unchanged", async () => {
    eq((await get("far", "api/card-contexts?atMyShops=1")).body.total, 0);
    eq((await get("north", "api/card-contexts?atMyShops=1")).body.total, 0);
    const plain = (await get("casey", "api/card-contexts?pokedex=25")).body;
    assert(plain.total >= 2, "the ordinary catalogue was narrowed");
  });
  test("Casey's own projection names only Northline and its three available copies", async () => {
    const v = (await get("casey", "api/view")).body.state;
    eq(json(v.partners.map((p) => p.name)), json(["Northline Cards"]));
    eq(json(v.inventory.map((i) => [i.partnerId, i.grade, i.ask, i.status, i.firmOnPrice]).sort()),
      json([["p-north", "PSA 8", 1200, "available", false], ["p-north", "PSA 9", 85, "available", true], ["p-north", "Raw", 12, "available", false]]));
    assert(!JSON.stringify(v).includes("p-far") && !JSON.stringify(v).includes("Faraway"), "the unconnected shop reached the Collector");
  });
});

describe("B. it follows the world", () => {
  test("a price and firmness change shows; a removal takes the card out of At my shops", async () => {
    const c = await world();
    await c.postAs("north", "updateInventoryCopy", { invId: c.ids.shops.n1, patch: { ask: 15, firmOnPrice: true } });
    const v = (await get("casey", "api/view")).body.state;
    const n1 = v.inventory.find((i) => i.invId === c.ids.shops.n1);
    eq(json([n1.ask, n1.firmOnPrice]), json([15, true]));
    await c.postAs("north", "removeInventoryCopy", { invId: c.ids.shops.n1 });
    await c.postAs("north", "removeInventoryCopy", { invId: c.ids.shops.n2 });
    eq(json(names((await get("casey", "api/card-contexts?atMyShops=1")).body)), json(["Charizard Base Set #4"]));
  });
  test("opening a deal on a copy does not hide it (the shipped product has no step that reserves one yet)", async () => {
    const c = await world();
    const goal = (await c.world()).goals.find((g) => g.id === c.ids.goal);
    await c.post("updateGoalCriteria", { goalId: goal.id, desired: { grade: "PSA 8" } });
    await c.post("startOpportunity", { goalId: goal.id, invId: c.ids.shops.n3, amount: 1200 });
    eq((await get("casey", "api/card-contexts?atMyShops=1")).body.total, 1);
  });
  test("the rule itself, on the domain: pending, archived and unconnected copies are never 'at your shops'", () => {
    const { createStore } = require("./fixture-store.cjs");
    const { projectForActor, availableAtShops } = require("../domain/metyet-projection.js");
    const AT = "2026-10-01";
    const st = createStore({
      partners: [{ id: "near", name: "Near", tradeRate: 0.7 }, { id: "far", name: "Far", tradeRate: 0.7 }],
      collectors: [{ id: "c1", name: "Casey" }, { id: "c2", name: "Dana" }],
      relationships: [{ partnerId: "near", collectorId: "c1", status: "accepted", at: AT }, { partnerId: "near", collectorId: "c2", status: "accepted", at: AT }],
      goals: [{ id: "g2", collectorId: "c2", canonicalCardId: "k-held", tier: "primary", desired: { grade: "PSA 9" } }],
      inventory: [], collectorCopies: [], binders: [], binderEntries: [], binderMemberships: [], opportunities: [],
      catalog: [], copyReviews: [], photoRequests: [], conversations: [], interests: [] });
    const add = (who, copy) => st.execute({ partnerId: who }, "addInventoryCopy", { copy: { ask: 10, ...copy }, at: AT }).value;
    add("near", { canonicalCardId: "k-open", grade: "PSA 9" });
    const held = add("near", { canonicalCardId: "k-held", grade: "PSA 9" });
    const gone = add("near", { canonicalCardId: "k-gone", grade: "PSA 9" });
    add("far", { canonicalCardId: "k-far", grade: "PSA 9" });
    assert(st.execute({ partnerId: "near" }, "removeInventoryCopy", { invId: gone, at: AT }).ok !== false);
    const opp = st.execute({ collectorId: "c2" }, "startOpportunity", { goalId: "g2", invId: held, amount: 10, at: AT }).value;
    assert(st.execute({ partnerId: "near" }, "setCopyPending", { invId: held, oppId: opp, at: AT }).ok !== false, "could not hold the copy");
    eq(json(availableAtShops(projectForActor(st.get(), { collectorId: "c1" })).sort()), json(["k-open"]));
    /* and a copy pending for the Collector's OWN deal is in their view — as
       "pending" — and still not "at your shops" */
    assert(st.execute({ collectorId: "c1" }, "addGoal", { canonicalCardId: "k-open", tier: "primary", desired: { grade: "PSA 9" }, at: AT }).ok !== false);
    const g1 = st.get().goals.find((g) => g.collectorId === "c1").id;
    const openInv = st.get().inventory.find((i) => i.canonicalCardId === "k-open").invId;
    const opp1 = st.execute({ collectorId: "c1" }, "startOpportunity", { goalId: g1, invId: openInv, amount: 10, at: AT }).value;
    assert(st.execute({ partnerId: "near" }, "setCopyPending", { invId: openInv, oppId: opp1, at: AT }).ok !== false);
    const mine = projectForActor(st.get(), { collectorId: "c1" });
    eq(mine.inventory.find((i) => i.invId === openInv).status, "pending");
    eq(json(availableAtShops(mine)), json([]));
    eq(json(availableAtShops(projectForActor(st.get(), { partnerId: "near" }))), json([]));
  });
});

describe("E. looking is looking", () => {
  test("browsing and At my shops write nothing: the world version does not move", async () => {
    const c = await world();
    const v0 = (await get("casey", "api/view")).body;
    const before = json([v0.version, v0.state.goals.length, (v0.state.opportunities || []).length]);
    for (const u of ["api/card-contexts?atMyShops=1", "api/card-contexts?atMyShops=1&query=charizard", "api/card-contexts?pokedex=258", "api/view"]) await get("casey", u);
    const v1 = (await get("casey", "api/view")).body;
    eq(json([v1.version, v1.state.goals.length, (v1.state.opportunities || []).length]), before);
    c.server.close();
  });
});

/* ============================================================== C, D */
const Discover = load("client/browse/Discover.jsx");
const CardDetail = load("client/collector/CardDetail.jsx").default;
const CTX = (id, n, name = "Mudkip") => ({ cardContextId: id, cardName: name, expansionName: "Ruby & Sapphire", collectorNumber: n });
const STATE = {
  actor: { seat: "collector", collectorId: "c1" },
  partners: [{ id: "p-north", name: "Northline Cards" }, { id: "p-west", name: "West Coast" }],
  goals: [], collectorCopies: [], binderMemberships: [], binders: [],
  inventory: [
    { invId: "i1", partnerId: "p-north", canonicalCardId: "k60n", grade: "Raw", condition: "Near Mint", ask: 12, firmOnPrice: false, status: "available", grading: { state: "raw", label: "Raw · Near Mint" } },
    { invId: "i2", partnerId: "p-west", canonicalCardId: "k60r", grade: "PSA 9", ask: 85, firmOnPrice: true, status: "available", grading: { state: "graded", label: "PSA 9" } },
    { invId: "i3", partnerId: "p-north", canonicalCardId: "k59", grade: "PSA 10", ask: 300, status: "pending", grading: { state: "graded", label: "PSA 10" } },
    { invId: "i4", partnerId: "p-north", canonicalCardId: "k59", grade: "PSA 9", ask: 200, status: "unavailable", grading: { state: "graded", label: "PSA 9" } }],
};
const DESCRIBED = { k60n: { canonicalCardId: "k60n", cardContextId: "x60" }, k60r: { canonicalCardId: "k60r", cardContextId: "x60" }, k59: { canonicalCardId: "k59", cardContextId: "x59" } };
async function discover(state = STATE) {
  stubWindow();
  const finds = [];
  const browse = { find: async (q) => { finds.push(q); return { contexts: /atMyShops=1/.test(q) ? [CTX("x60", "60")] : [CTX("x59", "59"), CTX("x60", "60")], total: /atMyShops=1/.test(q) ? 1 : 2 }; },
    describe: async (ids) => ({ cards: ids.map((id) => DESCRIBED[id]).filter(Boolean) }),
    pokemon: async () => ({ pokemon: [], total: 0, generations: [] }), expansions: async () => ({ expansions: [], total: 0 }), artists: async () => ({ artists: [], total: 0 }) };
  let session = { ...Discover.newBrowseSession(), pokemon: { dex: 258, name: "Mudkip" } };
  let r;
  const draw = async () => TR.act(async () => {
    const el = React.createElement(Discover.default, { state, browse, browsing: session, onBrowsing: (s) => { session = s; draw(); }, onChoose() {} });
    if (r) r.update(el); else r = TR.create(el);
  });
  await draw(); await settle(); await draw(); await settle();
  return { get r() { return r; }, finds, draw };
}
const cell = (r, n) => r.root.findAll((x) => x.type === "button" && cls(x).includes("mcs-dcell") && x.props["aria-label"].includes(`#${n}`))[0] || null;
/* (P6-F5A.1) the scope: All Cards | Trusted Partners, a radio pair */
const scope = (r, id) => r.root.findAll((x) => x.type === "button" && x.props.role === "radio" && x.props["data-scope"] === id)[0] || null;
const scopeGroup = (r) => r.root.findAll((x) => x.props && x.props.role === "radiogroup" && cls(x) === "mcs-dscope")[0] || null;
const emptyDiscover = async (state, session0) => {
  stubWindow();
  const finds = [];
  const empty = { find: async (q) => { finds.push(q); return { contexts: [], total: 0 }; }, describe: async () => ({ cards: [] }),
    pokemon: async () => ({ pokemon: [], total: 0 }), expansions: async () => ({ expansions: [], total: 0 }), artists: async () => ({ artists: [], total: 0 }) };
  let session = { ...Discover.newBrowseSession(), ...session0 };
  let r; const draw = async () => TR.act(async () => { const el = React.createElement(Discover.default, { state, browse: empty, browsing: session, onBrowsing: (x) => { session = x; draw(); }, onChoose() {} }); if (r) r.update(el); else r = TR.create(el); });
  await draw(); await settle(); await draw(); await settle();
  return { get r() { return r; }, finds, get session() { return session; } };
};

describe("C. the grid", () => {
  test("'With a Trusted Partner' only on the card with an AVAILABLE copy — not on one whose copies are pending or unavailable", async () => {
    const d = await discover();
    assert(/With a Trusted Partner/.test(flat(cell(d.r, "60"))), flat(cell(d.r, "60")));
    assert(!/With a Trusted Partner/.test(flat(cell(d.r, "59"))), "a pending or unavailable copy was called available");
    assert(!/At your shops|At my shops/.test(flat(d.r.root)), "the old storefront words remain");
  });
  test("All Cards is the default; Trusted Partners is the server flag; back to All Cards; the Pokémon chosen is kept both ways", async () => {
    const d = await discover();
    assert(!d.finds.some((q) => /atMyShops/.test(q)), "the default asked for partners: " + d.finds.join(" | "));
    eq(json([scope(d.r, "all").props["aria-checked"], scope(d.r, "partners").props["aria-checked"]]), json([true, false]));
    await TR.act(async () => { scope(d.r, "partners").props.onClick(); }); await settle(); await d.draw(); await settle();
    assert(/atMyShops=1/.test(d.finds[d.finds.length - 1]) && /pokedex=258/.test(d.finds[d.finds.length - 1]), d.finds.join(" | "));
    eq(json([scope(d.r, "all").props["aria-checked"], scope(d.r, "partners").props["aria-checked"]]), json([false, true]));
    eq(cell(d.r, "59"), null);
    assert(/Pokémon: Mudkip/.test(flat(d.r.root)), "the Pokémon chosen was lost");
    const n = d.finds.length;
    await TR.act(async () => { scope(d.r, "all").props.onClick(); }); await settle(); await d.draw(); await settle();
    assert(cell(d.r, "59"), "All Cards did not bring the rest back");
    /* All Cards reuses the page already loaded for it (the session's cache);
       nothing asked after the switch is partner-scoped */
    assert(!d.finds.slice(n).some((q) => /atMyShops/.test(q)), "All Cards still asked for partners: " + d.finds.join(" | "));
  });
  test("the scope keeps the search text, and Clear all clears constraints, not the scope", async () => {
    const d = await emptyDiscover(STATE, { text: "mudkip", shops: true });
    assert(/atMyShops=1/.test(d.finds[d.finds.length - 1]) && /query=mudkip/.test(d.finds[d.finds.length - 1]), d.finds.join(" | "));
    await TR.act(async () => { scope(d.r, "all").props.onClick(); }); await settle();
    eq(json([d.session.text, d.session.shops]), json(["mudkip", false]));
  });
  test("keyboard: the scope is a radio group; arrow keys switch it; only the chosen one is in the tab order", async () => {
    const d = await discover();
    const g = scopeGroup(d.r);
    eq(g.props["aria-label"], "Browse");
    eq(json([scope(d.r, "all").props.tabIndex, scope(d.r, "partners").props.tabIndex]), json([0, -1]));
    await TR.act(async () => { g.props.onKeyDown({ key: "ArrowRight", preventDefault() {} }); }); await settle(); await d.draw(); await settle();
    eq(scope(d.r, "partners").props["aria-checked"], true);
    eq(json([scope(d.r, "all").props.tabIndex, scope(d.r, "partners").props.tabIndex]), json([-1, 0]));
  });
  test("the order: search, then the scope, then the doorways", async () => {
    stubWindow();
    const browse = { find: async () => ({ contexts: [], total: 0 }), describe: async () => ({ cards: [] }),
      pokemon: async () => ({ pokemon: [], total: 0, generations: [] }), expansions: async () => ({ expansions: [], total: 0 }), artists: async () => ({ artists: [], total: 0 }) };
    let r; await TR.act(async () => { r = TR.create(React.createElement(Discover.default, { state: STATE, browse, browsing: Discover.newBrowseSession(), onBrowsing() {}, onChoose() {} })); }); await settle();
    const order = r.root.findAll((n) => n.props && (cls(n) === "mcs-dsearch" || cls(n) === "mcs-dscope" || cls(n) === "mcs-dtabs")).map(cls);
    eq(json(order), json(["mcs-dsearch", "mcs-dscope", "mcs-dtabs"]));
  });
  test("Trusted Partners with nothing matching: said without implying the card doesn't exist; 'Browse all cards' keeps the search", async () => {
    const d = await emptyDiscover(STATE, { text: "mudkip", shops: true });
    assert(/No matching cards are available from your Trusted Partners right now\. Browse all cards/.test(flat(d.r.root)), flat(d.r.root));
    const go = d.r.root.findAll((x) => x.type === "button" && flat(x) === "Browse all cards")[0];
    await TR.act(async () => { go.props.onClick(); }); await settle();
    eq(json([d.session.text, d.session.shops]), json(["mudkip", false]));
  });
  test("no Trusted Partners: the scope is there, and Trusted Partners says why there is nothing", async () => {
    const d = await emptyDiscover({ ...STATE, partners: [], inventory: [] }, { shops: true });
    assert(scope(d.r, "partners"));
    assert(/You're not connected to any Trusted Partners yet, so there's no partner inventory to show\. Browse all cards/.test(flat(d.r.root)), flat(d.r.root));
  });
});

const P = (id, finish) => ({ canonicalCardId: id, cardContextId: "x60", printRun: "unlimited", finish, language: "en", stamp: "none", printVariation: "standard", status: "active" });
const MUD = { cardContextId: "x60", cardName: "Mudkip", expansionName: "Ruby & Sapphire", collectorNumber: "60", cards: [P("k60n", "non_holo"), P("k60r", "reverse_holofoil")] };
const detail = (state = STATE, context = MUD) => { stubWindow(); let r; TR.act(() => { r = TR.create(React.createElement(CardDetail, { context, state, onClose() {}, onSave: async () => ({ ok: true }) })); }); return r; };
describe("D. the card", () => {
  test("grouped by shop, shops by name; within a shop by printing then added — never by price", () => {
    const st = { ...STATE, partners: [{ id: "p-z", name: "Zed's" }, { id: "p-a", name: "Alpha" }],
      inventory: [
        { invId: "z1", partnerId: "p-z", canonicalCardId: "k60r", grade: "PSA 9", ask: 5, status: "available", addedAt: "2030-01-01", grading: { label: "PSA 9" } },
        { invId: "a2", partnerId: "p-a", canonicalCardId: "k60r", grade: "PSA 10", ask: 1, status: "available", addedAt: "2030-01-01", grading: { label: "PSA 10" } },
        { invId: "a1", partnerId: "p-a", canonicalCardId: "k60n", grade: "PSA 8", ask: 999, status: "available", addedAt: "2030-02-01", grading: { label: "PSA 8" } },
        { invId: "a3", partnerId: "p-a", canonicalCardId: "k60n", grade: "PSA 7", ask: 3, status: "available", addedAt: "2030-03-01", grading: { label: "PSA 7" } }] };
    const r = detail(st);
    const shops = r.root.findAll((n) => n.type === "li" && cls(n) === "mcs-cd-shop");
    eq(json(shops.map((g) => [g.props["data-shop"], g.findAll((n) => n.type === "li" && n !== g).map((x) => x.props["data-inv"])])),
      json([["p-a", ["a1", "a3", "a2"]], ["p-z", ["z1"]]]));
  });
  test("each available copy of THESE printings: shop, printing, grading, Proposed Market Price, Open to Offers / Firm on Price", () => {
    const r = detail();
    const sec = r.root.findAll((n) => cls(n) === "mcs-cd-shops")[0];
    assert(sec, "no Available from your Trusted Partners section");
    assert(/^Available from your Trusted Partners/.test(flat(sec)), flat(sec));
    const shops = sec.findAll((n) => n.type === "li" && cls(n) === "mcs-cd-shop");
    eq(json(shops.map((g) => [flat(g.findAll((n) => cls(n) === "mcs-cd-shop-name")[0]),
      g.findAll((n) => n.type === "li" && n !== g).map(flat)])), json([
      /* (P6-F5B: each copy now ends with its next step — no Goal here, so Add as Primary Goal) */
      ["Northline Cards", ["Normal · Raw · Near Mint Available Proposed Market Price $12 · Open to Offers Add as Primary Goal"]],
      ["West Coast", ["Reverse Holo · PSA 9 Available Proposed Market Price $85 · Firm on Price Add as Primary Goal"]]]));
    assert(!/CERT|cost/i.test(flat(sec)), "private inventory metadata shown");
  });
  test("pending, unavailable and other cards' copies are not shown; a card with none says so quietly", () => {
    const r = detail(STATE, { ...MUD, cardContextId: "x59", collectorNumber: "59", cards: [{ ...P("k59", "non_holo"), cardContextId: "x59" }] });
    eq(r.root.findAll((n) => cls(n) === "mcs-cd-shops").length, 0);
    assert(/None of your Trusted Partners has this card available right now\./.test(flat(r.root)));
  });
  test("no Trusted Partners: nothing about shops at all", () => {
    const r = detail({ ...STATE, partners: [], inventory: [] });
    assert(!/Trusted Partners|At your shops|Available from/.test(flat(r.root)));
  });
  test("the card still asks its questions and writes nothing by being looked at", () => {
    const r = detail();
    assert(/Which version\?/.test(flat(r.root)));
  });
});

run();
