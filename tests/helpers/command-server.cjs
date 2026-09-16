/* ============================================================================
   A REAL SERVER, FOR THE CLIENT TO TALK TO

     const { app, close } = await serve(createApp)
     const api = createApiClient({ baseUrl: "http://localhost",
       getToken: async () => TOKEN, fetchImpl: fetchFor(app) })

   The real Fastify app, the real routes, the real account directory, the real
   command transaction, the real domain, and a real Postgres (PGlite, in
   process). Only the identity provider is a stand-in, exactly as
   phase3-server.cjs does it — a token names its subject.

   WHY THIS EXISTS. A client test that invents a server proves the invention
   works. `client/api.js` branches on status codes, on the presence of
   `refused`, and on an error `code` — all of which are the SERVER's choices. If
   those choices change, the tests that matter should fail here rather than
   quietly keep passing against a fixture that remembers how the server used to
   behave.

   `fetchFor` is the only adaptation: Fastify's `inject` in the shape `fetch`
   returns, so the real api client can be pointed at it unchanged.
   ========================================================================== */
const { PGlite } = require("@electric-sql/pglite");
const RT = require("../../domain/metyet-runtime.js");
const { fromPGlite } = require("../../persistence/database.js");
const { migrate } = require("../../persistence/migrate.js");
const { createWorldRepository } = require("../../persistence/world-repository.js");
const { createAccountDirectory } = require("../../server/auth/accounts.js");

const SUBJECT = "sub-northline";
const TOKEN = `token-for:${SUBJECT}`;
const PARTNER = "p1";
const COLLECTOR = "c1";

/* A TP command that needs no new domain work and demonstrates the whole point:
   it is TP-only, it is authority-checked against a real Relationship, and its
   timestamp comes from the SERVER's runtime — `at` is on the server's forbidden
   payload list, so the client could not supply one if it tried. */
const COMMAND = "markBinderReviewed";
const PAYLOAD = { collectorId: COLLECTOR };

const card = (id, name, num) => ({ id, name, set: "Base Set", num, print: "Holo",
  edition: "Unlimited", language: "English", grade: "PSA 9", condition: null, tags: [] });

const world = () => ({
  catalog: [card("k1", "Charizard", "4/102"), card("k2", "Blastoise", "2/102")],
  collectors: [{ id: COLLECTOR, name: "Casey" }],
  partners: [{ id: PARTNER, name: "Northline", tradeRate: 0.8 }],
  relationships: [{ partnerId: PARTNER, collectorId: COLLECTOR, status: "accepted", at: "2026-01-01" }],
  invitations: [],
  goals: [{ id: "g1", collectorId: COLLECTOR, cardId: "k1", tier: "primary" }],
  preferences: [],
  inventory: [{ invId: "i1", partnerId: PARTNER, cardId: "k1", ask: 4200, cost: 3100, archived: false,
    photos: { front: "i1:front", back: "i1:back" } }],
  binder: [{ id: "b1", collectorId: COLLECTOR, cardId: "k2", market: 900, cert: null,
    photos: { front: "b1:front", back: "b1:back" } }],
  interests: [], conversations: [], opportunities: [], photoRequests: [], copyReviews: [], activity: [],
});

function fakeVerifier() {
  return {
    async verify(token) {
      const match = /^token-for:(.+)$/.exec(token);
      if (!match) {
        const error = new Error("the bearer token was not accepted (signature)");
        error.code = "token.invalid";
        error.reason = "signature";
        throw error;
      }
      return { subject: match[1] };
    },
  };
}

async function serve(createApp, { repositoryWrapper } = {}) {
  const pg = new PGlite();
  const db = fromPGlite(pg);
  await migrate(db);
  const base = createWorldRepository(db);
  await base.saveWorld(world());
  const repository = repositoryWrapper ? repositoryWrapper(base) : base;
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: SUBJECT, role: "tp", partnerId: PARTNER });
  const app = createApp({ repository, accounts, verifier: fakeVerifier(),
    runtime: RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 60000 }) });
  return { app, repository: base, accounts, close: async () => { await pg.close(); } };
}

/* Fastify's inject, wearing what fetch returns. */
const fetchFor = (app) => async (url, init = {}) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, "");
  const res = await app.inject({
    method: init.method || "GET",
    url: path,
    headers: init.headers || {},
    ...(init.body === undefined ? {} : { payload: init.body }),
  });
  return {
    status: res.statusCode,
    async json() { return JSON.parse(res.body); },
  };
};

module.exports = { serve, fetchFor, TOKEN, SUBJECT, PARTNER, COLLECTOR, COMMAND, PAYLOAD, world };
