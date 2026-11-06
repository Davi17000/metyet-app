/* ============================================================================
   MILESTONE 2D.1 — CANONICAL DEAL MESSAGING FOUNDATION

   One conversation per canonical opportunity, between that deal's two
   participants and nobody else, through the real stack: PGlite with every
   migration, the world repository, the command transaction, the Fastify app
   with its authentication and allow-list, and the domain.

     A. core messaging: send, read, reply, one shared ordered history, restart,
        reauthentication, concurrent sends, validation, nonce retries
     B. authorization: nobody else reads or sends; no forged sender or deal
     C. negotiation isolation: words are words; only commands change a deal
     D. lifecycle: active and agreed deals take messages; ended and completed
        deals keep their history readable and take no more
     E. persistence: migration 0015, legacy card-linked threads, the schema's
        own one-thread-per-deal rule
   ========================================================================== */
const { describe, test, assert, eq, run } = require("./run.cjs");
const { PGlite } = require("@electric-sql/pglite");
const { fromPGlite } = require("../persistence/database.js");
const { migrate, readMigrations } = require("../persistence/migrate.js");
const { createWorldRepository } = require("../persistence/world-repository.js");
const { createCatalogRepository } = require("../persistence/catalog-repository.js");
const { executeCommand } = require("../persistence/command-transaction.js");
const { createApp } = require("../server/app.js");
const { createAccountDirectory } = require("../server/auth/accounts.js");
const { EXPOSED_COMMANDS } = require("../server/exposed-commands.js");
const { validateWorld } = require("../domain/metyet-world.js");
const { createStore } = require("./fixture-store.cjs");
const D = require("../domain/metyet-domain.js");
const RT = require("../domain/metyet-runtime.js");

const json = (v) => JSON.stringify(v);
const SUBJECT = { casey: "sub-casey", jordan: "sub-jordan", north: "sub-north", silver: "sub-silver", far: "sub-far" };

/* ------------------------------------------------------------- THE SERVER
   Casey (c1) is connected to Northline (p1) and Silver Vale (p2); Jordan (c2)
   to Northline and Faraway (p3). Casey has two deals with Northline — one per
   printing of Mudkip #60 — and one with Silver Vale (a Holo Mudkip #60); Jordan
   has one of his own with Northline. */
async function world() {
  const pg = new PGlite();
  const db = fromPGlite(pg);
  await migrate(db);
  const runtime = RT.systemRuntime();
  const repository = createWorldRepository(db);
  const catalog = createCatalogRepository(db, { newId: runtime.newId });
  await repository.saveWorld({
    catalog: [], collectors: [{ id: "c1", name: "Casey" }, { id: "c2", name: "Jordan" }],
    partners: [{ id: "p1", name: "Northline", tradeRate: 0.7 }, { id: "p2", name: "Silver Vale", tradeRate: 0.6 },
      { id: "p3", name: "Faraway", tradeRate: 0.6 }],
    relationships: [
      { partnerId: "p1", collectorId: "c1", status: "accepted", at: "2030-01-01" },
      { partnerId: "p2", collectorId: "c1", status: "accepted", at: "2030-01-01" },
      { partnerId: "p1", collectorId: "c2", status: "accepted", at: "2030-01-01" },
      { partnerId: "p3", collectorId: "c2", status: "accepted", at: "2030-01-01" }],
    invitations: [], goals: [], inventory: [], collectorCopies: [], binders: [], binderEntries: [],
    interests: [], opportunities: [], conversations: [], photoRequests: [], copyReviews: [] });
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: SUBJECT.casey, role: "collector", collectorId: "c1" });
  await accounts.linkAccount({ subject: SUBJECT.jordan, role: "collector", collectorId: "c2" });
  await accounts.linkAccount({ subject: SUBJECT.north, role: "tp", partnerId: "p1" });
  await accounts.linkAccount({ subject: SUBJECT.silver, role: "tp", partnerId: "p2" });
  await accounts.linkAccount({ subject: SUBJECT.far, role: "tp", partnerId: "p3" });
  const verifier = { verify: async (token) => {
    if (!SUBJECT[token]) throw Object.assign(new Error("no"), { reason: "bad token" });
    return { subject: SUBJECT[token], email: `${token}@example.invalid`, emailVerified: true };
  } };
  const boot = async () => { const app = createApp({ repository: createWorldRepository(db), catalog, accounts, verifier, runtime }); await app.ready(); return app; };
  const ctx = { pg, db, repository, catalog, app: await boot() };
  /* A restart: a new app and a new repository over the same database. */
  ctx.restart = async () => { await ctx.app.close(); ctx.app = await boot(); };
  ctx.send = async (who, command, payload) => {
    const res = await ctx.app.inject({ method: "POST", url: "/api/commands",
      headers: who ? { authorization: `Bearer ${who}` } : {}, payload: { command, payload } });
    const body = res.json();
    return { status: res.statusCode, ok: res.statusCode === 200, value: body.value, refused: body.error && body.error.refused, body };
  };
  ctx.view = async (who) => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/view", headers: { authorization: `Bearer ${who}` } });
    return res.json().state;
  };
  const okv = async (who, command, payload) => {
    const r = await ctx.send(who, command, payload);
    assert(r.ok, `${who} ${command}: ${json(r.body)}`);
    return r.value;
  };
  ctx.okv = okv;
  const { expansionId } = await catalog.putExpansion({ game: "pokemon", code: "ex1", name: "Ruby & Sapphire", printedTotal: 109 });
  const { cardContextId } = await catalog.putCardContext({ game: "pokemon", expansionId,
    collectorNumber: "60", cardName: "Mudkip", artist: "Ken Sugimori", rarity: "Common" });
  const x = (await catalog.putCanonicalCard({ cardContextId, finish: "non_holo" })).canonicalCardId;
  const y = (await catalog.putCanonicalCard({ cardContextId, finish: "reverse_holofoil" })).canonicalCardId;
  const z = (await catalog.putCanonicalCard({ cardContextId, finish: "holofoil" })).canonicalCardId;
  ctx.gA = await okv("casey", "addGoal", { canonicalCardId: x, tier: "primary", desired: { grade: "PSA 9" } });
  ctx.gB = await okv("casey", "addGoal", { canonicalCardId: y, tier: "primary", desired: { grade: "PSA 9" } });
  ctx.gJ = await okv("jordan", "addGoal", { canonicalCardId: x, tier: "primary", desired: { grade: "PSA 9" } });
  ctx.gS = await okv("casey", "addGoal", { canonicalCardId: z, tier: "primary", desired: { grade: "PSA 9" } });
  ctx.i1 = await okv("north", "addInventoryCopy", { copy: { canonicalCardId: x, grade: "PSA 9", ask: 120, cost: 61 } });
  ctx.i2 = await okv("north", "addInventoryCopy", { copy: { canonicalCardId: y, grade: "PSA 9", ask: 90, cost: 40 } });
  ctx.i4 = await okv("north", "addInventoryCopy", { copy: { canonicalCardId: x, grade: "PSA 9", ask: 130, cost: 70 } });
  ctx.i3 = await okv("silver", "addInventoryCopy", { copy: { canonicalCardId: z, grade: "PSA 9", ask: 200, cost: 90 } });
  ctx.o1 = await okv("casey", "startOpportunity", { goalId: ctx.gA, invId: ctx.i1, amount: 100 });
  ctx.o2 = await okv("casey", "startOpportunity", { goalId: ctx.gB, invId: ctx.i2, amount: 80 });
  ctx.oJ = await okv("jordan", "startOpportunity", { goalId: ctx.gJ, invId: ctx.i4, amount: 110 });
  ctx.o3 = await okv("casey", "startOpportunity", { goalId: ctx.gS, invId: ctx.i3, amount: 180 });
  return ctx;
}
let n = 0;
const nonce = () => `nonce-${++n}`;
const say = (ctx, who, oppId, text, k = nonce()) => ctx.send(who, "sendDealMessage", { oppId, text, nonce: k });
const threadOf = (state, oppId) => (state.conversations || []).find((t) => t.oppId === oppId && t.key === D.dealThreadKey(oppId)) || null;
const lines = (t) => (t ? t.entries.map((e) => `${e.by}:${e.text}`) : []);
const stored = async (ctx) => ctx.repository.loadWorld();

/* ================================================================ A */
describe("A. core messaging", () => {
  test("[1–5] Casey sends, Northline reads and replies, Casey reads it: one shared, ordered history", async () => {
    const ctx = await world();
    const m1 = await say(ctx, "casey", ctx.o1, "Is the corner as clean as the scan?");
    assert(m1.ok && /^m/.test(m1.value), "Casey's message was not stored: " + json(m1.body));
    eq(lines(threadOf(await ctx.view("north"), ctx.o1)).join("|"), "collector:Is the corner as clean as the scan?", "Northline does not see it");
    eq((await say(ctx, "north", ctx.o1, "Yes — I can send photos tonight.")).ok, true, "Northline could not reply");
    const casey = threadOf(await ctx.view("casey"), ctx.o1);
    const north = threadOf(await ctx.view("north"), ctx.o1);
    eq(lines(casey).join("|"), "collector:Is the corner as clean as the scan?|tp:Yes — I can send photos tonight.");
    eq(json(casey.entries.map((e) => [e.id, e.at, e.by, e.senderId, e.text])),
      json(north.entries.map((e) => [e.id, e.at, e.by, e.senderId, e.text])), "the two participants see different histories");
    eq(json(casey.entries.map((e) => e.senderId)), json(["c1", "p1"]), "the sender is not the authenticated actor");
    assert(casey.entries[0].at <= casey.entries[1].at, "not in chronological order");
    eq([casey.key, casey.oppId, casey.collectorId, casey.partnerId, casey.cardId].join("|"), `opp::${ctx.o1}|${ctx.o1}|c1|p1|`, "the thread is not the deal's own");
  });
  test("one conversation per deal: two deals between the same two people do not share one", async () => {
    const ctx = await world();
    await say(ctx, "casey", ctx.o1, "About the Normal");
    await say(ctx, "casey", ctx.o2, "About the Reverse Holo");
    await say(ctx, "casey", ctx.o1, "Normal again");
    const v = await ctx.view("casey");
    eq(lines(threadOf(v, ctx.o1)).join("|"), "collector:About the Normal|collector:Normal again");
    eq(lines(threadOf(v, ctx.o2)).join("|"), "collector:About the Reverse Holo");
    eq((await stored(ctx)).conversations.filter((t) => t.oppId === ctx.o1).length, 1, "a second thread for one deal");
  });
  test("[6] messages survive a server restart and a fresh sign-in", async () => {
    const ctx = await world();
    await say(ctx, "casey", ctx.o1, "Before the restart");
    await say(ctx, "north", ctx.o1, "Got it");
    await ctx.restart();
    eq(lines(threadOf(await ctx.view("casey"), ctx.o1)).join("|"), "collector:Before the restart|tp:Got it", "lost on restart");
    eq(lines(threadOf(await ctx.view("north"), ctx.o1)).join("|"), "collector:Before the restart|tp:Got it");
    eq((await say(ctx, "casey", ctx.o1, "After the restart")).ok, true);
    eq(threadOf(await ctx.view("north"), ctx.o1).entries.length, 3);
  });
  test("[7] two participants sending at the same moment lose nothing", async () => {
    const ctx = await world();
    const sends = [];
    for (let i = 0; i < 5; i += 1) {
      sends.push(say(ctx, "casey", ctx.o1, `casey ${i}`));
      sends.push(say(ctx, "north", ctx.o1, `north ${i}`));
    }
    const results = await Promise.all(sends);
    assert(results.every((r) => r.ok), "a concurrent send failed: " + json(results.filter((r) => !r.ok).map((r) => r.body)));
    const t = threadOf(await ctx.view("casey"), ctx.o1);
    eq(t.entries.length, 10, "a message was lost");
    eq(new Set(t.entries.map((e) => e.id)).size, 10, "two messages share an id");
    const ats = t.entries.map((e) => e.at);
    eq(json(ats), json([...ats].sort()), "the stored order is not chronological");
    eq(json(threadOf(await ctx.view("north"), ctx.o1).entries.map((e) => e.id)), json(t.entries.map((e) => e.id)), "the participants disagree on order");
    /* ONE THREAD, in the database itself, though all ten were first-message
       attempts on a deal that had none — and still one after a restart. */
    const rows = async () => (await ctx.pg.query(`select c.id, count(e.*)::int as n from metyet.conversations c
      left join metyet.conversation_entries e on e.conversation_id = c.id
      where c.opportunity_id = '${ctx.o1}' group by c.id`)).rows;
    eq(json(await rows()), json([{ id: `topp::${ctx.o1}`, n: 10 }]), "not exactly one stored thread holding all ten");
    await ctx.restart();
    eq((await say(ctx, "north", ctx.o1, "after the restart")).ok, true);
    eq(json(await rows()), json([{ id: `topp::${ctx.o1}`, n: 11 }]), "a restart started a second thread");
  });
  test("concurrent FIRST messages on several fresh deals: each deal ends with exactly one thread", async () => {
    const ctx = await world();
    const firsts = [];
    for (const [who, opp] of [["casey", ctx.o1], ["north", ctx.o1], ["casey", ctx.o2], ["north", ctx.o2],
      ["casey", ctx.o3], ["silver", ctx.o3], ["jordan", ctx.oJ], ["north", ctx.oJ]]) firsts.push(say(ctx, who, opp, `first from ${who}`));
    assert((await Promise.all(firsts)).every((r) => r.ok), "a first message failed");
    const counts = (await ctx.pg.query(`select opportunity_id, count(*)::int as n from metyet.conversations
      where card_id is null group by opportunity_id order by opportunity_id`)).rows;
    eq(json(counts.map((r) => r.n)), json([1, 1, 1, 1]), "a deal has more than one thread: " + json(counts));
    eq(json(counts.map((r) => r.opportunity_id).sort()), json([ctx.o1, ctx.o2, ctx.o3, ctx.oJ].sort()));
  });
  test("[8–9] text is trimmed; empty, whitespace-only and oversized messages are refused and store nothing", async () => {
    const ctx = await world();
    const before = json((await stored(ctx)).conversations);
    eq((await say(ctx, "casey", ctx.o1, "")).refused, "message-empty");
    eq((await say(ctx, "casey", ctx.o1, "   \n\t ")).refused, "message-empty");
    eq((await ctx.send("casey", "sendDealMessage", { oppId: ctx.o1, nonce: nonce() })).refused, "message-empty", "no text at all");
    eq((await ctx.send("casey", "sendDealMessage", { oppId: ctx.o1, text: { html: "<b>x</b>" }, nonce: nonce() })).refused, "message-empty", "not a string");
    eq((await say(ctx, "casey", ctx.o1, "x".repeat(2001))).refused, "message-too-long");
    eq(json((await stored(ctx)).conversations), before, "a refused message left a record");
    eq((await say(ctx, "casey", ctx.o1, "  " + "y".repeat(2000) + "  ")).ok, true, "2,000 characters, trimmed, is allowed");
    eq((await say(ctx, "casey", ctx.o1, "  <b>hello</b> [Accept](#)  ")).ok, true);
    eq(threadOf(await ctx.view("north"), ctx.o1).entries[1].text, "<b>hello</b> [Accept](#)", "the text was not kept exactly, as plain text");
  });
  test("[10] a nonce is required; a retry returns the original; a reused nonce with new words is refused", async () => {
    const ctx = await world();
    eq((await ctx.send("casey", "sendDealMessage", { oppId: ctx.o1, text: "hi" })).refused, "nonce-required");
    eq((await ctx.send("casey", "sendDealMessage", { oppId: ctx.o1, text: "hi", nonce: "  " })).refused, "nonce-required");
    const first = await say(ctx, "casey", ctx.o1, "Only once", "n-retry");
    const again = await say(ctx, "casey", ctx.o1, "  Only once ", "n-retry");
    eq(again.value, first.value, "a retry made a second message");
    eq((await say(ctx, "casey", ctx.o1, "Different words", "n-retry")).refused, "nonce-conflict");
    /* the other participant's nonces are their own */
    eq((await say(ctx, "north", ctx.o1, "Only once", "n-retry")).ok, true);
    await ctx.restart();
    eq((await say(ctx, "casey", ctx.o1, "Only once", "n-retry")).value, first.value, "a retry after a restart made a second message");
    eq((await say(ctx, "casey", ctx.o1, "Changed after a restart", "n-retry")).refused, "nonce-conflict", "the conflict is not durable");
    eq(lines(threadOf(await ctx.view("casey"), ctx.o1)).join("|"), "collector:Only once|tp:Only once");
    /* the database holds exactly two messages, whatever was retried */
    eq((await ctx.pg.query(`select count(*)::int as n from metyet.conversation_entries where conversation_id = 'topp::${ctx.o1}'`)).rows[0].n, 2,
      "a retry or a conflict created another message");
  });
  test("a nonce is scoped to the deal AND the sender: the same nonce on Casey's other deal is a new message", async () => {
    const ctx = await world();
    const a = await say(ctx, "casey", ctx.o1, "same words", "shared-nonce");
    const b = await say(ctx, "casey", ctx.o2, "same words", "shared-nonce");
    const c = await say(ctx, "casey", ctx.o3, "different words", "shared-nonce");
    assert(a.ok && b.ok && c.ok, "the same nonce was refused on a different deal");
    eq(new Set([a.value, b.value, c.value]).size, 3, "one deal's nonce answered for another's");
    const v = await ctx.view("casey");
    eq([ctx.o1, ctx.o2, ctx.o3].map((o) => threadOf(v, o).entries.length).join(","), "1,1,1");
  });
  test("a nonce reaches only the participant who wrote it", async () => {
    const ctx = await world();
    await say(ctx, "casey", ctx.o1, "mine", "casey-nonce");
    await say(ctx, "north", ctx.o1, "theirs", "north-nonce");
    const casey = threadOf(await ctx.view("casey"), ctx.o1).entries;
    const north = threadOf(await ctx.view("north"), ctx.o1).entries;
    eq(json(casey.map((e) => e.nonce)), json(["casey-nonce", undefined]));
    eq(json(north.map((e) => e.nonce)), json([undefined, "north-nonce"]));
  });
});

/* ================================================================ B */
describe("B. authorization", () => {
  test("[11–13] another Collector, an unconnected partner and Casey's other connected partner can neither send nor read", async () => {
    const ctx = await world();
    await say(ctx, "casey", ctx.o1, "Private to Northline");
    const before = json((await stored(ctx)).conversations);
    eq((await say(ctx, "jordan", ctx.o1, "let me in")).refused, "not-participant", "another Collector");
    eq((await say(ctx, "far", ctx.o1, "let me in")).refused, "not-participant", "an unconnected partner");
    eq((await say(ctx, "silver", ctx.o1, "let me in")).refused, "not-participant", "a different partner connected to Casey");
    eq(json((await stored(ctx)).conversations), before, "a refused send wrote something");
    for (const who of ["jordan", "far", "silver"]) {
      const v = await ctx.view(who);
      assert(!JSON.stringify(v).includes("Private to Northline"), `${who} received the message`);
      assert(!JSON.stringify(v).includes(D.dealThreadKey(ctx.o1)), `${who} received the thread`);
    }
  });
  test("[16b] every view holds exactly its own deals' threads — one Collector, two partners, four deals", async () => {
    const ctx = await world();
    for (const [who, opp] of [["casey", ctx.o1], ["casey", ctx.o2], ["casey", ctx.o3], ["jordan", ctx.oJ]]) {
      eq((await say(ctx, who, opp, `${who} on ${opp}`)).ok, true);
    }
    const keys = async (who) => (await ctx.view(who)).conversations.filter((t) => t.cardId == null).map((t) => t.oppId).sort();
    eq(json(await keys("casey")), json([ctx.o1, ctx.o2, ctx.o3].sort()), "Casey's view");
    eq(json(await keys("north")), json([ctx.o1, ctx.o2, ctx.oJ].sort()), "Northline's view");
    eq(json(await keys("silver")), json([ctx.o3]), "Silver Vale's view");
    eq(json(await keys("jordan")), json([ctx.oJ]), "Jordan's view");
    eq(json(await keys("far")), json([]), "Faraway's view");
    /* and no message text leaks into a view that does not hold its thread */
    const text = async (who) => JSON.stringify(await ctx.view(who));
    assert(!(await text("silver")).includes(`casey on ${ctx.o1}`) && !(await text("silver")).includes(`casey on ${ctx.o2}`), "Silver Vale sees Northline's deals");
    assert(!(await text("north")).includes(`casey on ${ctx.o3}`), "Northline sees Silver Vale's deal");
    assert(!(await text("casey")).includes(`jordan on ${ctx.oJ}`), "Casey sees Jordan's deal");
    eq((await say(ctx, "north", ctx.o3, "not mine")).refused, "not-participant", "Northline wrote into Silver Vale's deal");
    eq((await say(ctx, "silver", ctx.o1, "not mine")).refused, "not-participant", "Silver Vale wrote into Northline's deal");
  });
  test("[4b] a participant in one deal cannot reach another deal — Jordan's deal with the same partner is his alone", async () => {
    const ctx = await world();
    await say(ctx, "jordan", ctx.oJ, "Jordan to Northline");
    eq((await say(ctx, "casey", ctx.oJ, "hi")).refused, "not-participant");
    assert(!JSON.stringify(await ctx.view("casey")).includes("Jordan to Northline"), "Casey sees Jordan's conversation");
    eq(lines(threadOf(await ctx.view("north"), ctx.oJ)).join("|"), "collector:Jordan to Northline", "Northline cannot see it");
  });
  test("[14] a forged sender is rejected at the door; forged participants or thread fields are ignored", async () => {
    const ctx = await world();
    /* authority keys never reach the domain: the server's door refuses them */
    for (const forged of [{ by: "collector" }, { seat: "collector" }, { actor: { collectorId: "c1" } }, { at: "1999-01-01T00:00:00.000Z" }]) {
      const r = await ctx.send("jordan", "sendDealMessage", { oppId: ctx.o1, text: "forged", nonce: nonce(), ...forged });
      eq(r.status, 400, `a payload setting ${Object.keys(forged)[0]} was accepted`);
    }
    /* naming somebody else's ids changes nothing: Jordan is still Jordan */
    const r = await ctx.send("jordan", "sendDealMessage", { oppId: ctx.o1, text: "forged", nonce: nonce(),
      collectorId: "c1", partnerId: "p1", senderId: "c1" });
    eq(r.refused, "not-participant", "a forged participant got in: " + r.status + " " + json(r.body));
    const ok = await ctx.send("casey", "sendDealMessage", { oppId: ctx.o1, text: "as myself", nonce: nonce(),
      senderId: "p1", partnerId: "p2", collectorId: "c2", key: "opp::other", id: "m-forged" });
    assert(ok.ok, json(ok.body));
    const t = threadOf(await ctx.view("north"), ctx.o1);
    const e = t.entries[0];
    eq([e.by, e.senderId, t.collectorId, t.partnerId, t.key].join("|"), `collector|c1|c1|p1|opp::${ctx.o1}`, "the payload chose an identity");
    assert(e.id !== "m-forged", "the payload chose an id");
    eq((await stored(ctx)).conversations.length, 1, "a forged send stored something");
  });
  test("[15] a forged or unknown deal is refused; an unauthenticated caller is refused before the domain", async () => {
    const ctx = await world();
    eq((await say(ctx, "casey", "o-does-not-exist", "hello")).refused, "not-found");
    eq((await say(ctx, "casey", "", "hello")).refused, "not-found");
    const anon = await ctx.send(null, "sendDealMessage", { oppId: ctx.o1, text: "hello", nonce: nonce() });
    eq(anon.status, 401, "an unauthenticated send was not rejected");
    const bad = await ctx.app.inject({ method: "POST", url: "/api/commands", headers: { authorization: "Bearer nobody" },
      payload: { command: "sendDealMessage", payload: { oppId: ctx.o1, text: "hello", nonce: nonce() } } });
    eq(bad.statusCode, 401, "a bad token was not rejected");
    eq((await stored(ctx)).conversations.length, 0, "something was stored");
  });
  test("[16] the view takes no parameters: asking for another deal's messages returns only your own", async () => {
    const ctx = await world();
    await say(ctx, "jordan", ctx.oJ, "Jordan's words");
    const res = await ctx.app.inject({ method: "GET", url: `/api/view?oppId=${ctx.oJ}&collectorId=c2`,
      headers: { authorization: "Bearer casey" } });
    assert(!res.body.includes("Jordan's words"), "a query parameter reached another deal's messages");
  });
  test("the legacy messaging commands stay closed in production; only sendDealMessage was added", async () => {
    const ctx = await world();
    for (const cmd of ["sendMessage", "reachOut", "recordNote", "markDealViewed"]) {
      assert(!EXPOSED_COMMANDS.includes(cmd), `${cmd} is exposed`);
      eq((await ctx.send("casey", cmd, { oppId: ctx.o1, partnerId: "p1", text: "x" })).refused, "command-unavailable", cmd);
    }
    assert(EXPOSED_COMMANDS.includes("sendDealMessage"));
    /* RESTATED (M3A A3, founder-authorized): + Select Trade's six. The legacy messaging commands above are still closed. */
    eq(EXPOSED_COMMANDS.length, 37);
  });
});

/* ================================================================ C */
describe("C. negotiation isolation", () => {
  const dealOf = async (ctx, id) => (await stored(ctx)).opportunities.find((o) => o.id === id);
  test("[17–19, 21] 'I accept your $11 offer' is words: nothing about the deal, its price or its progress moves", async () => {
    const ctx = await world();
    await ctx.okv("north", "proposePrice", { oppId: ctx.o1, amount: 110 });
    const before = await stored(ctx);
    const deal = json(before.opportunities);
    const inv = json(before.inventory);
    const goals = json(before.goals);
    for (const text of ["I accept your $110 offer.", "Accept", "Counter $95", "I'll pay $500", "withdraw", "/accept", "Deal!"]) {
      eq((await say(ctx, "casey", ctx.o1, text)).ok, true, text);
    }
    eq((await say(ctx, "north", ctx.o1, "Accepted at $110 — and the price is now $200")).ok, true);
    const after = await stored(ctx);
    eq(json(after.opportunities), deal, "a message changed an opportunity — its price, turn, stage or history");
    eq(json(after.inventory), inv, "a message changed inventory");
    eq(json(after.goals), goals, "a message changed a Goal");
    const o = await dealOf(ctx, ctx.o1);
    eq([o.listedPrice, o.agreedPrice, o.stage, o.priceThread.length].join("|"), "120||agree-price|2", "the deal moved");
    assert(!o.priceThread.some((e) => /accept/i.test(e.type) || e.text), "a message reached the price history");
  });
  test("[20, 22] Accept and Counter still work after messages, and only they set the Agreed Market Price", async () => {
    const ctx = await world();
    await say(ctx, "casey", ctx.o1, "Would you take $105?");
    await ctx.okv("north", "proposePrice", { oppId: ctx.o1, amount: 110 });
    await say(ctx, "casey", ctx.o1, "I accept");
    eq((await dealOf(ctx, ctx.o1)).agreedPrice, null, "a message accepted the offer");
    await ctx.okv("casey", "acceptPrice", { oppId: ctx.o1 });
    const o = await dealOf(ctx, ctx.o1);
    eq([o.listedPrice, o.agreedPrice, o.stage].join("|"), "120|110|select-trade", "the structured Accept did not work");
    eq(json(o.priceThread.map((e) => `${e.by}:${e.type}:${e.amount}`)), json(["collector:offer:100", "tp:counter:110", "collector:accept:110"]));
  });
});

/* ================================================================ D */
describe("D. lifecycle", () => {
  test("[23–24] an active deal and an agreed one both take messages", async () => {
    const ctx = await world();
    eq((await say(ctx, "casey", ctx.o1, "while negotiating")).ok, true);
    await ctx.okv("north", "proposePrice", { oppId: ctx.o1, amount: 110 });
    await ctx.okv("casey", "acceptPrice", { oppId: ctx.o1 });
    eq((await say(ctx, "north", ctx.o1, "agreed — let's choose the trade")).ok, true, "agreement ended the conversation");
    eq(threadOf(await ctx.view("casey"), ctx.o1).entries.length, 2);
  });
  test("[25] withdrawn and declined deals keep their history readable and take no more — a retry still answers", async () => {
    const ctx = await world();
    const sent = await say(ctx, "casey", ctx.o1, "before withdrawing", "n-before");
    await ctx.okv("casey", "cancelOpportunity", { oppId: ctx.o1 });
    eq((await say(ctx, "casey", ctx.o1, "after")).refused, "terminal");
    eq((await say(ctx, "north", ctx.o1, "after")).refused, "terminal");
    eq((await say(ctx, "casey", ctx.o1, "before withdrawing", "n-before")).value, sent.value, "a retry of a message stored before the end");
    eq(lines(threadOf(await ctx.view("north"), ctx.o1)).join("|"), "collector:before withdrawing", "the history is not readable");
    const o = (await stored(ctx)).opportunities.find((x) => x.id === ctx.o1);
    eq([o.declined, o.outcome].join("|"), "true|ended", "messaging reopened the deal");
    await say(ctx, "casey", ctx.o2, "before the decline");
    await ctx.okv("north", "declineOffer", { oppId: ctx.o2 });
    eq((await say(ctx, "casey", ctx.o2, "after")).refused, "terminal");
    eq(lines(threadOf(await ctx.view("casey"), ctx.o2)).join("|"), "collector:before the decline");
  });
  test("[26] a completed deal is read-only (domain, through the same command)", () => {
    const M = require("../dist/MetYet.cjs");
    const st = createStore(M.buildCanonicalSeed({ review: true, demoStage: "completed" }));
    const done = st.get().opportunities.find((o) => o.stage === "completed");
    assert(done, "precondition: a completed deal");
    const actor = { collectorId: done.collectorId };
    const r = st.execute(actor, "sendDealMessage", { oppId: done.id, text: "anything else?", nonce: "n" });
    eq(r.refused, "terminal");
  });
  test("the relationship ending later does not take the deal's conversation from its participants", async () => {
    const ctx = await world();
    await say(ctx, "casey", ctx.o1, "before the relationship changed");
    await ctx.pg.query(`update metyet.relationships set attrs = jsonb_set(attrs, '{status}', '"revoked"') where partner_id = 'p1' and collector_id = 'c1'`);
    await ctx.restart();
    const w = await stored(ctx);
    eq(w.relationships.find((r) => r.partnerId === "p1" && r.collectorId === "c1").status, "revoked", "precondition: the relationship ended");
    eq((await ctx.send("casey", "requestPhotos", { invId: ctx.i4 })).refused, "no-relationship", "precondition: the domain treats the relationship as ended");
    eq(lines(threadOf(await ctx.view("casey"), ctx.o1)).join("|"), "collector:before the relationship changed", "the history was taken away");
    eq((await say(ctx, "north", ctx.o1, "still here for this deal")).ok, true, "the active deal's participants lost the conversation");
    eq((await say(ctx, "casey", ctx.o1, "and me")).ok, true);
  });
});

/* ================================================================ E */
/* Key order is the database's, not the world's: compare values, not spelling. */
const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
/* The product seed, with a LEGACY card-linked thread written the legacy way —
   the domain's own `sendMessage`, keyed by a legacy catalogue card — so the
   upgrade and side-by-side checks run against what production-shaped legacy
   rows actually look like. */
const legacyWorld = (M, opts) => {
  const st = createStore(M.buildCanonicalSeed(opts));
  const w = st.get();
  const rel = w.relationships.find((r) => r.status === "accepted");
  const card = w.catalog[0];
  const r = st.execute({ collectorId: rel.collectorId }, "sendMessage", { partnerId: rel.partnerId, cardId: card.id, text: "a legacy thread" });
  assert(r.ok !== false, "could not write a legacy thread: " + json(r));
  return st.get();
};
describe("E. persistence and migration 0015", () => {
  const fresh = async (upTo) => {
    const pg = new PGlite();
    const db = fromPGlite(pg);
    const all = readMigrations();
    await migrate(db, { migrations: upTo ? all.filter((m) => m.version <= upTo) : all });
    return { pg, db, all, repo: createWorldRepository(db) };
  };
  test("an existing database with legacy card-linked threads upgrades through 0015 unchanged", async () => {
    const M = require("../dist/MetYet.cjs");
    const { pg, db, all, repo } = await fresh("0014_binder_memberships");
    const seed = legacyWorld(M);
    assert(seed.conversations.length > 0 && seed.conversations.every((t) => t.cardId), "precondition: legacy threads with cards");
    await repo.saveWorld(seed);
    const rowsBefore = json((await pg.query("select id, key, card_id, opportunity_id, attrs from metyet.conversations order by id")).rows);
    const up = await migrate(db, { migrations: all });
    eq(up.applied.join(","), "0015_deal_conversations");
    eq(json((await pg.query("select id, key, card_id, opportunity_id, attrs from metyet.conversations order by id")).rows), rowsBefore, "a legacy row changed");
    const back = await createWorldRepository(db).loadWorld();
    eq(stable(back.conversations), stable(seed.conversations), "a legacy thread did not reload exactly");
    assert(validateWorld(back).ok, "the legacy world is no longer valid");
  });
  test("legacy and deal threads live side by side and round-trip exactly", async () => {
    const M = require("../dist/MetYet.cjs");
    const { repo } = await fresh();
    await repo.saveWorld(legacyWorld(M, { review: true, demoStage: "agree-price" }));
    const w = await repo.loadWorld();
    const live = w.opportunities.find((o) => D.isActive(o));
    const actor = { collectorId: live.collectorId };
    const r = await executeCommand(repo, { actor, command: "sendDealMessage",
      payload: { oppId: live.id, text: "beside the legacy threads", nonce: "n-legacy" }, runtime: RT.systemRuntime() });
    assert(r.ok, json(r));
    const back = await repo.loadWorld();
    eq(stable(back), stable(r.world), "the world did not reload exactly");
    const deal = back.conversations.find((t) => t.key === D.dealThreadKey(live.id));
    eq([deal.cardId, deal.oppId, deal.entries.length].join("|"), `|${live.id}|1`);
    assert(back.conversations.some((t) => t.cardId), "the legacy threads are gone");
    assert(validateWorld(back).ok);
  });
  test("the schema itself holds one thread per deal, and refuses a thread that names neither a card nor its deal", async () => {
    const ctx = await world();
    await say(ctx, "casey", ctx.o1, "first");
    const q = (sql) => ctx.pg.query(sql).then(() => "ok", (e) => e.message);
    assert(/conversations_card_or_deal/.test(await q(`insert into metyet.conversations (id, ord, key, collector_id, partner_id, card_id, opportunity_id, attrs)
      values ('t-x', 90, 'whatever', 'c1', 'p1', null, null, '{}')`)), "a thread with neither card nor deal was stored");
    assert(/conversations_card_or_deal/.test(await q(`insert into metyet.conversations (id, ord, key, collector_id, partner_id, card_id, opportunity_id, attrs)
      values ('t-y', 91, 'opp::someone-else', 'c1', 'p1', null, '${ctx.o1}', '{}')`)), "a deal thread with a foreign key was stored");
    assert(/conversations_key_key|duplicate/.test(await q(`insert into metyet.conversations (id, ord, key, collector_id, partner_id, card_id, opportunity_id, attrs)
      values ('t-z', 92, 'opp::${ctx.o1}', 'c1', 'p1', null, '${ctx.o1}', '{}')`)), "a second thread for one deal was stored");
    assert(/conversations_opportunity_fk|foreign key/.test(await q(`insert into metyet.conversations (id, ord, key, collector_id, partner_id, card_id, opportunity_id, attrs)
      values ('t-w', 93, 'opp::${ctx.oJ}', 'c1', 'p1', null, '${ctx.oJ}', '{}')`)), "a deal thread between the wrong people was stored");
  });
  test("the world validator holds the same rules in memory", () => {
    const M = require("../dist/MetYet.cjs");
    const w = createStore(M.buildCanonicalSeed({ review: true, demoStage: "agree-price" })).get();
    const o = w.opportunities[0];
    const thread = (over) => ({ id: "tx", key: D.dealThreadKey(o.id), collectorId: o.collectorId, partnerId: o.partnerId,
      cardId: null, oppId: o.id, entries: [{ id: "m1", at: "2030-01-01T00:00:00.000Z", kind: "message", by: "collector", text: "hi" }], ...over });
    assert(validateWorld({ ...w, conversations: [...w.conversations, thread({})] }).ok, "a good deal thread is invalid");
    assert(!validateWorld({ ...w, conversations: [...w.conversations, thread({ oppId: null })] }).ok, "a thread naming nothing passed");
    assert(!validateWorld({ ...w, conversations: [...w.conversations, thread({ key: "opp::x" })] }).ok, "a wrong deal key passed");
    assert(!validateWorld({ ...w, conversations: [...w.conversations, thread({ partnerId: "p-someone" })] }).ok, "a thread between other people passed");
  });
});

run();
