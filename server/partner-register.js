/* ============================================================================
   ACCEPTING AN INVITATION, AND THEN LOOKING AT WHAT IT MADE

     npm run partner:register [-- --url=… --token-file=…]
     npm run api:view         [-- --url=… --token-file=…]

   `POST /api/registration/partner` is the accept: the one route reachable by
   somebody who has signed in but is nobody in MetYet yet. Until now the only
   things that had ever called it were tests, in-process. Proving it for real
   meant constructing an HTTP request by hand with two credentials in it — a
   bearer token and a private invitation credential — which with curl means
   both end up in shell history and in `ps` output, and with a browser console
   means both end up in a scrollback buffer. Those are the two worst places for
   either of them.

   So there is a command. The bearer is READ FROM A FILE, the credential is
   TYPED AT A TERMINAL and not echoed, and neither is ever an argument, printed,
   logged, or returned. `api:view` is the same shape with no credential: it
   proves the sign-in that just registered can now read its own shop.

   WHAT THIS IS AND IS NOT. It composes exactly one HTTP request out of things
   the operator already has, and it decides nothing. Every rule about who may
   redeem what lives on the server, in registration.js, under one transaction:
   the invitation is claimed, the partner registered, the sign-in bound and the
   invitation completed, or none of it happens. This command cannot make a
   partner, cannot spend an invitation twice, cannot bypass the provider's
   confirmed-address check, and has no privileges of its own. Point it at a
   server that refuses and it is refused.

   WHY THE URL IS CHECKED. The request carries a bearer token and a single-use
   credential, so it may not cross a plaintext connection to anywhere but this
   machine — the same rule the provider endpoints are held to, and the same
   function, so the two cannot drift apart.

   WHAT IT PRINTS. The partner id, the world version, and what the projection
   contains. Those identify the thing that was created; none of them is a
   secret, and nothing else is printed at all.
   ========================================================================== */

const fs = require("fs");
const { isSafeProviderUrl } = require("./auth/identity.js");
const { askSecret } = require("./secret-prompt.js");

const DEFAULT_TOKEN_FILE = ".secrets/access-token";
const DEFAULT_URL = "http://127.0.0.1:8080";
const DEFAULT_TIMEOUT_MS = 15000;

/* WHY THE CREDENTIAL IS BARELY CHECKED HERE.

   It is 32 symbols from the runtime's alphabet, and a regex saying so would be
   easy to write. It would also be the same mistake the sign-in harness already
   made once: a shape encoded in a second place, refusing a real credential
   locally the moment the first place changes. Nothing is gained by it either —
   a wrong credential simply does not match `where token_hash = $1`, so it is
   refused by the database without spending anything.

   What IS worth catching is the mistake a person actually makes at a hidden
   prompt: pasting the wrong secret. Whitespace means a copy picked up a line
   break, and a value equal to the bearer means the access token went in by
   mistake — which would send it to the server as an invitation credential. Both
   are refused. Nothing else is. */
function credentialProblem(credential, bearer) {
  if (!credential) return "nothing was typed";
  if (/\s/.test(credential)) return "it has a space or a line break in it, so the copy picked up more than the credential";
  if (credential === bearer) return "that is the access token, not the invitation credential";
  return null;
}

/* The bearer comes from a file, never an argument: an access token on a command
   line is in shell history and in `ps` for every other process on the machine. */
function readBearer(file) {
  let token;
  try {
    token = fs.readFileSync(file, "utf8").trim();
  } catch (error) {
    throw new Error(`the token file could not be read (${(error && error.code) || "unknown"}). `
      + `Sign in first: npm run auth:sign-in -- --email=<your address>`);
  }
  if (!token) throw new Error(`${file} is empty. Sign in first: npm run auth:sign-in -- --email=<your address>`);
  return token;
}

function checkUrl(base) {
  const url = String(base || "").replace(/\/+$/, "");
  if (!isSafeProviderUrl(url)) {
    throw new Error("the server URL must be https (http is accepted only for this machine). "
      + "This request carries a bearer token and a single-use credential.");
  }
  return url;
}

/* A failed request answers with the server's own vocabulary and nothing else.
   The body is not printed: a 4xx from something that is not MetYet could echo
   anything back, including what was sent. */
const REFUSALS = {
  "invitation-unusable": "the credential is unknown, expired, revoked, or has already been used. "
    + "Those are one answer on purpose — telling them apart would let someone with a list of guesses learn which exist.",
  "wrong-recipient": "that invitation was issued to a different address than the one this sign-in is confirmed at.",
  "email-unverified": "the provider reports no confirmed address for this sign-in, so it cannot be shown to be the one invited.",
  "already-linked": "this sign-in is already bound to somebody in MetYet. One account per person, deliberately.",
};

const explain = (status, refused) => {
  if (refused && REFUSALS[refused]) return `${refused} — ${REFUSALS[refused]}`;
  if (status === 401) return "the server did not accept the bearer token (401). It may have expired — an access token lasts an hour.";
  if (status === 403) return "the server refused the request (403).";
  if (status === 404) return "there is no registration route on that server (404). Is it running this build?";
  if (status === 503) return "the server could not ask the identity provider (503). Nothing was spent; try again.";
  return `the server answered ${status}${refused ? ` (${refused})` : ""}`;
};

async function send(url, { method = "GET", bearer, body, timeoutMs, fetchImpl }) {
  const response = await (fetchImpl || fetch)(url, {
    method,
    headers: {
      authorization: `Bearer ${bearer}`,
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response || typeof response.status !== "number") throw new Error("the server answered with something unreadable");
  let payload = null;
  try { payload = await response.json(); } catch (error) { payload = null; }
  return { status: response.status, payload };
}

/* WHO THE PROJECTION SAYS YOU ARE.

   The domain's actor is `{ seat, partnerId }` or `{ seat, collectorId }` — a
   seat and the id for that seat, and nothing else. This printed `actor.id`,
   which no projection has ever carried, so a correctly authenticated Trusted
   Partner read `you are: (no id)`. Authentication, binding and projection were
   all right; the line describing them was wrong, which is the worst kind of
   display bug because it reads like a real failure.

   So the seat decides which field is the id, the way the domain writes it. The
   NAME is not on the actor either — it is on the actor's own record inside the
   projection, which is the only record of its kind there (a partner sees one
   partner: itself). Read, never assumed: a projection without it still prints. */

/* What a projection contains, as counts. The shop's contents are the partner's
   business and there is no reason to print them; that there is exactly one
   actor and nothing else is the thing being proved. */
const SEATS = {
  tp: { id: "partnerId", records: "partners" },
  collector: { id: "collectorId", records: "collectors" },
};

function describeActor(state) {
  const actor = (state && state.actor) || null;
  const seat = actor && SEATS[actor.seat];
  if (!seat) return { id: null, name: null, seat: (actor && actor.seat) || null };
  const id = actor[seat.id] || null;
  const mine = (Array.isArray(state[seat.records]) ? state[seat.records] : []).find((r) => r && r.id === id);
  return { id, name: (mine && mine.name) || null, seat: actor.seat };
}

function describeState(state) {
  if (!state || typeof state !== "object") return "(no state)";
  const counts = Object.entries(state)
    .filter(([key]) => key !== "actor")
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.length : (value && typeof value === "object" ? Object.keys(value).length : String(value))}`);
  return counts.length ? counts.join(", ") : "empty";
}

async function registerPartner({ say = console.log, url = DEFAULT_URL, tokenFile = DEFAULT_TOKEN_FILE,
  timeoutMs = DEFAULT_TIMEOUT_MS, deps = {} } = {}) {
  let base, bearer;
  try {
    base = checkUrl(url);
    bearer = readBearer(tokenFile);
  } catch (error) {
    say(`failed:      ${error.message}`);
    return 1;
  }

  say(`server:      ${base}`);
  say(`bearer:      ${tokenFile}  (read, never printed)`);
  say("");
  say("The invitation credential is the one MetYet sent you. It is typed, not");
  say("echoed, and never passed as an argument. It is single-use: this either");
  say("registers the Trusted Partner or changes nothing at all.");
  say("");

  let credential;
  try {
    credential = await (deps.askSecret || askSecret)("credential: ");
  } catch (error) {
    say(`failed:      ${error.message}`);
    return 1;
  }
  const problem = credentialProblem(credential, bearer);
  if (problem) { say(`failed:      ${problem}`); return 1; }

  let result;
  try {
    /* Exactly one field. The route refuses any other, and so does this. */
    result = await send(`${base}/api/registration/partner`,
      { method: "POST", bearer, body: { token: credential }, timeoutMs, fetchImpl: deps.fetchImpl });
  } catch (error) {
    say("failed:      the server could not be reached. Is it running? (npm start, in another terminal)");
    return 1;
  }

  if (result.status !== 200) {
    /* `refused` is the server's own small vocabulary (registration.js REFUSALS),
       and it is the only thing taken out of the body. The message the server
       sent is not printed: a 4xx from something that is not MetYet could echo
       back anything, including what was sent to it. */
    const error = result.payload && result.payload.error;
    const refused = error && typeof error.refused === "string" ? error.refused : null;
    say(`failed:      ${explain(result.status, refused)}`);
    say("             Nothing was created and the invitation was not spent.");
    return 1;
  }

  const payload = result.payload || {};
  const actor = describeActor(payload.state);
  say(`registered:  ${actor.id || "(the projection named no actor)"}`);
  if (actor.name) say(`store:       ${actor.name}`);
  say(`version:     ${payload.version}`);
  say(`your shop:   ${describeState(payload.state)}`);
  say("");
  say("That was one transaction: the invitation is spent, the Trusted Partner exists");
  say("in the canonical world, and this sign-in is bound to it. Running this again");
  say("cannot make a second one.");
  say("");
  say("  npm run partner:invitations     it should now read `accepted`");
  say("  npm run account:list            one active account, bound to this subject");
  say("  npm run api:view                the same sign-in, reading its own shop");
  return 0;
}

/* The proof that the binding took: the same bearer, no credential, reading what
   the server projects for whoever that token turns out to be. */
async function view({ say = console.log, url = DEFAULT_URL, tokenFile = DEFAULT_TOKEN_FILE,
  timeoutMs = DEFAULT_TIMEOUT_MS, deps = {} } = {}) {
  let base, bearer;
  try {
    base = checkUrl(url);
    bearer = readBearer(tokenFile);
  } catch (error) {
    say(`failed:      ${error.message}`);
    return 1;
  }

  let result;
  try {
    result = await send(`${base}/api/view`, { bearer, timeoutMs, fetchImpl: deps.fetchImpl });
  } catch (error) {
    say("failed:      the server could not be reached. Is it running? (npm start, in another terminal)");
    return 1;
  }

  if (result.status !== 200) {
    const code = result.payload && result.payload.error && result.payload.error.code;
    if (code === "account_not_provisioned") {
      say("failed:      this sign-in is not anybody in MetYet yet.");
      say("             An invitation makes one: npm run partner:register");
      return 1;
    }
    if (code === "account_disabled") { say("failed:      this sign-in's account is disabled."); return 1; }
    say(`failed:      ${explain(result.status, code)}`);
    return 1;
  }

  const payload = result.payload || {};
  const actor = describeActor(payload.state);
  say(`you are:     ${actor.id || "(the projection named no actor)"}${actor.name ? `  ${actor.name}` : ""}`);
  say(`version:     ${payload.version}`);
  say(`your shop:   ${describeState(payload.state)}`);
  return 0;
}

module.exports = { registerPartner, view, credentialProblem, readBearer, checkUrl, describeState, describeActor,
  explain, DEFAULT_TOKEN_FILE, DEFAULT_URL };
