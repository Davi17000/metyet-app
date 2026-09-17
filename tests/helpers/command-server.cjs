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

/* A SECOND SEAT, FOR SEAM TESTS ONLY. Batch 10 needs a Collector on the other
   end of the same real server to prove the whole path — auth, actor,
   projection, routing, reads — joins up for both seats.

   THIS IS TEST PROVISIONING, NOT THE PRODUCT LIFECYCLE. The world is seeded
   with a Collector and the account directory is told about them, exactly as
   tests/phase3-server.cjs has always done. It creates no invitation, no
   redemption, no acceptance and no relationship command, and it is NOT hosted
   proof of anything: the absence of a real Collector onboarding path is a
   Phase 5 dependency and this does not close it. */
const COLLECTOR_SUBJECT = "sub-casey";
const COLLECTOR_TOKEN = `token-for:${COLLECTOR_SUBJECT}`;

/* Distinctive values that must never cross the projection boundary. Every one
   is a substring, so a leak is detectable rather than arguable. */
const MARK = Object.freeze({
  cost: 31337,                       // a TP's acquisition cost
  acquired: "2019-07-07",            // and when they got it
  relNote: "TP-PRIVATE-NOTE-ABOUT-CASEY",
  relLast: "2026-08-05",
  relReviewed: "2026-07-30",
  activity: "TP-PRIVATE-ACTIVITY",
  tradeRate: 0.7777,
  /* A second Collector, related to NOBODY. Nothing in either seat's projection
     may ever name them. Without a second person in the world, "your projection
     holds exactly your own record" is satisfied by a world that holds one
     record — which is how a projector that stopped scoping walked past an
     earlier version of these tests. */
  stranger: "UNRELATED-DANA",
});

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
  collectors: [{ id: COLLECTOR, name: "Casey" }, { id: "c-stranger", name: MARK.stranger }],
  partners: [{ id: PARTNER, name: "Northline", tradeRate: MARK.tradeRate }],
  relationships: [{ partnerId: PARTNER, collectorId: COLLECTOR, status: "accepted", at: "2026-01-01",
    note: MARK.relNote, last: MARK.relLast, binderReviewedAt: MARK.relReviewed }],
  invitations: [],
  goals: [{ id: "g1", collectorId: COLLECTOR, cardId: "k1", tier: "primary", note: "CASEY-WANTS-CHARIZARD" }],
  preferences: [],
  inventory: [{ invId: "i1", partnerId: PARTNER, cardId: "k1", ask: 4200, cost: MARK.cost,
    acquired: MARK.acquired, archived: false, photos: { front: "i1:front", back: "i1:back" } }],
  binder: [{ id: "b1", collectorId: COLLECTOR, cardId: "k2", market: 900, cert: "CASEY-CERT-9001",
    photos: { front: "b1:front", back: "b1:back" } }],
  interests: [{ partnerId: PARTNER, binderId: "b1", at: "2026-02-02" }],
  conversations: [], opportunities: [], photoRequests: [], copyReviews: [],
  activity: [{ id: "a1", partnerId: PARTNER, collectorId: COLLECTOR, type: "manual",
    text: MARK.activity, date: "2026-03-03" }],
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

/* ONE Postgres for the process, re-migrated per call. Creating a PGlite
   instance is the expensive part, and a suite that boots a dozen servers pays
   it a dozen times; dropping and recreating the schema is the same isolation
   for a fraction of the cost. tests/phase3-server.cjs has always done this. */
let shared = null;

async function serve(createApp, { repositoryWrapper } = {}) {
  const pg = shared || (shared = new PGlite());
  await pg.exec("drop schema if exists metyet cascade; drop schema if exists metyet_auth cascade");
  const db = fromPGlite(pg);
  await migrate(db);
  const base = createWorldRepository(db);
  await base.saveWorld(world());
  const repository = repositoryWrapper ? repositoryWrapper(base) : base;
  const accounts = createAccountDirectory(db);
  await accounts.linkAccount({ subject: SUBJECT, role: "tp", partnerId: PARTNER });
  await accounts.linkAccount({ subject: COLLECTOR_SUBJECT, role: "collector", collectorId: COLLECTOR });
  const app = createApp({ repository, accounts, verifier: fakeVerifier(),
    runtime: RT.deterministicRuntime({ start: "2030-01-01T00:00:00.000Z", stepMs: 60000 }) });
  /* The instance is shared, so closing it would take the next server with it.
     Callers still call close(); it stays in the contract and does nothing. */
  return { app, repository: base, accounts, close: async () => {} };
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

module.exports = { serve, fetchFor, TOKEN, SUBJECT, PARTNER, COLLECTOR, COMMAND, PAYLOAD, world,
  COLLECTOR_SUBJECT, COLLECTOR_TOKEN, MARK };
