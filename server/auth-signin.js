/* ============================================================================
   ONE REAL SIGN-IN, FOR THE OPERATOR WHO HAS TO PROVE IT WORKS

     npm run auth:sign-in -- --email=<the address> [--out=<path>]

   `auth:check --token-file=…` already verifies a real access token the whole way
   through: signature against the project's JWKS, issuer, audience, expiry, and
   then the Auth server's own answer about whether that address is CONFIRMED.
   What it could not do was GET a token. Before this, proving the hosted
   environment end to end meant opening a browser console and pasting a session
   out of it — which is how an access token ends up in a clipboard, a scrollback
   buffer, and eventually a screenshot.

   So: this asks the provider to email the person, takes the six-digit code they
   type, and writes the resulting access token to a file that `auth:check` reads.
   The token is never printed, never passed as an argument, and never returned to
   the caller.

   WHAT THIS IS NOT. It is not a way in. It does the same two public calls the
   sign-in page will do, with the project's PUBLISHABLE key, and what it produces
   is one ordinary user session — the same thing a person gets from their inbox.
   A Supabase Auth user is not a MetYet actor: only redeeming an invitation makes
   one, and nothing here touches an invitation, the database, or the world. There
   is no route to it, it needs a terminal, and it grants nothing that receiving
   the email would not.

   THE PROVIDER'S DEFAULTS ARE LEFT ALONE. The sign-in request carries the
   address and nothing else — no `create_user`, so GoTrue's own default decides
   whether a first-time invited address may be created, exactly as the browser
   client's `signInWithOtp` leaves it. This file has no opinion about signup
   policy and must not acquire one.

   ONE CODE, TWO DOORS. Supabase's email OTP and magic link are two doors to the
   same credential: verifying with type "email" checks both the confirmation and
   the recovery token, which is why a code from a magic-link template verifies.
   Whichever door is used first spends it. This takes the code; following the
   link in the same email is the other path, and only one of them can work.
   ========================================================================== */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawnSync } = require("child_process");
const { loadAuthConfig } = require("./config.js");
const { isSafeProviderUrl } = require("./auth/identity.js");

/* Beside the repository, not in it, and ignored either way — see mustBeIgnored. */
const DEFAULT_OUT = ".secrets/access-token";
const DEFAULT_TIMEOUT_MS = 10000;
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOOKS_LIKE_CODE = /^[0-9]{6}$/;

/* The Auth endpoints, derived from the issuer the rest of the server already
   derives — so a project override moves all of them together and none of this
   can end up talking to a different project than the one being verified.

   Both carry something that must not cross a plaintext connection: the request
   sends the one-time code, and the answer contains a session. They are held to
   the same rule as the JWKS and user endpoints, defined once in identity.js. */
function endpoints(issuer) {
  const base = String(issuer || "").replace(/\/+$/, "");
  const otpUrl = `${base}/otp`;
  const verifyUrl = `${base}/verify`;
  for (const url of [otpUrl, verifyUrl]) {
    if (!isSafeProviderUrl(url)) {
      throw new Error("the sign-in endpoints must be https (http is accepted only for localhost). "
        + "This request carries a one-time code and returns a session.");
    }
  }
  return { otpUrl, verifyUrl };
}

/* A token file that git would commit is a token file that gets committed. If
   this is a git working tree, the destination has to be ignored; `git
   check-ignore` answers 0 for ignored, 1 for not, and 128 when there is no
   repository here at all — which is a fine place to put one. */
function mustBeIgnored(file, { run = spawnSync } = {}) {
  const result = run("git", ["check-ignore", "-q", "--", file], { stdio: "ignore" });
  if (result.error || result.status === null) return;          // no git on this machine
  if (result.status === 128) return;                           // not inside a repository
  if (result.status === 0) return;                             // ignored: safe
  throw new Error(`git does not ignore ${file}, so a token written there could be committed. `
    + `Write it under ${path.dirname(DEFAULT_OUT)}/ (which is ignored), or somewhere outside the repository.`);
}

/* 0600 on creation AND on a file that already existed — the mode argument only
   applies when the file is new, and re-using yesterday's world-readable file is
   exactly the case worth covering. */
function writeSecret(file, contents) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(file, "w", 0o600);
  try {
    fs.writeSync(fd, contents);
    try { fs.fchmodSync(fd, 0o600); } catch (error) { /* a filesystem without modes; the path is still ours */ }
  } finally {
    fs.closeSync(fd);
  }
}

/* The code is a credential. It is typed, so it is not in shell history, and it
   is not echoed, so it is not in a scrollback buffer or over a shoulder. A
   terminal is REQUIRED: no TTY means something is piping it in, which means it
   came from a file or a command line, which is the thing being avoided. */
function askForCode({ input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY) {
    return Promise.reject(new Error("the six-digit code has to be typed at a terminal. "
      + "Piping it in would put it in a file or a shell history, which is what this avoids."));
  }
  return new Promise((resolve, reject) => {
    const muted = new (require("stream").Writable)({ write(chunk, encoding, done) { done(); } });
    const rl = readline.createInterface({ input, output: muted, terminal: true });
    output.write("code:        ");
    rl.question("", (answer) => { rl.close(); output.write("\n"); resolve(String(answer).trim()); });
    rl.on("error", reject);
  });
}

async function postJson(url, body, { apiKey, timeoutMs, fetchImpl }) {
  const response = await (fetchImpl || fetch)(url, {
    method: "POST",
    headers: { apikey: apiKey, authorization: `Bearer ${apiKey}`,
      "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response || typeof response.status !== "number") throw new Error("the provider answered with something unreadable");
  return response;
}

/* Why a status and not the provider's message: the body of a failed verify can
   quote back what was sent. A number and a sentence of our own is enough to act
   on and carries nothing. */
const REFUSALS = {
  400: "the provider refused the request (400). Check SUPABASE_URL and the publishable key.",
  401: "the provider refused the key (401). SUPABASE_PUBLISHABLE_KEY is for a different project, or is not a publishable key.",
  403: "the code is wrong, already used, or expired (403). Each code is single-use — and following the link in the same email spends it too.",
  422: "the provider would not sign this address in (422). Email sign-in may be disabled for the project, or signups may be off for a first-time address.",
  429: "too many sign-in emails too quickly (429). Supabase rate-limits them; wait and run this again.",
};
const refusal = (status) => REFUSALS[status] || `the provider answered ${status}`;

/* `deps` is injected by the tests; production passes nothing and uses the
   platform's fetch, the real terminal and the real filesystem. */
async function signIn({ env = process.env, say = console.log, email, out = DEFAULT_OUT,
  timeoutMs = DEFAULT_TIMEOUT_MS, deps = {} } = {}) {
  const address = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!address || !LOOKS_LIKE_EMAIL.test(address)) {
    say("failed:      --email=<address> is required, and has to look like an address");
    return 2;
  }

  const config = loadAuthConfig(env);
  let otpUrl, verifyUrl;
  try {
    ({ otpUrl, verifyUrl } = endpoints(config.issuer));
    (deps.mustBeIgnored || mustBeIgnored)(out);
  } catch (error) {
    say(`failed:      ${error.message}`);
    return 1;
  }

  say(`project:     ${(() => { try { return new URL(config.issuer).host; } catch (error) { return "(unreadable)"; } })()}`);
  say(`address:     ${address}`);
  say(`token file:  ${out}  (created 0600, git-ignored, never printed)`);
  say("");

  /* ------------------------------------------------- 1. ask for the email */
  let sent;
  try {
    sent = await postJson(otpUrl, { email: address }, { apiKey: config.apiKey, timeoutMs, fetchImpl: deps.fetchImpl });
  } catch (error) {
    say("failed:      the provider could not be reached to send the email");
    return 1;
  }
  if (sent.status !== 200) { say(`failed:      ${refusal(sent.status)}`); return 1; }

  say("sent:        one email, carrying a six-digit code and a sign-in link.");
  say("             They are two doors to the same credential — using either one");
  say("             spends it, so use the code here and leave the link alone.");
  say("");

  /* ----------------------------------------------- 2. take the typed code */
  let code;
  try {
    code = await (deps.askForCode || askForCode)();
  } catch (error) {
    say(`failed:      ${error.message}`);
    return 1;
  }
  if (!LOOKS_LIKE_CODE.test(code)) { say("failed:      that is not a six-digit code"); return 1; }

  /* type "email" is the one that checks BOTH the confirmation and the recovery
     token, which is what makes a code from a magic-link template verify. */
  let verified;
  try {
    verified = await postJson(verifyUrl, { type: "email", email: address, token: code },
      { apiKey: config.apiKey, timeoutMs, fetchImpl: deps.fetchImpl });
  } catch (error) {
    say("failed:      the provider could not be reached to verify the code");
    return 1;
  }
  if (verified.status !== 200) { say(`failed:      ${refusal(verified.status)}`); return 1; }

  let session;
  try {
    session = await verified.json();
  } catch (error) {
    say("failed:      the provider's answer could not be read");
    return 1;
  }
  const token = session && typeof session.access_token === "string" ? session.access_token : "";
  if (!token) { say("failed:      the provider's answer carried no access token"); return 1; }

  /* ------------------------------------------------- 3. put it where only
     this person can read it. The REFRESH token is deliberately dropped on the
     floor: it outlives the access token by a long way, nothing downstream wants
     it, and the safest place for a credential is nowhere. */
  try {
    (deps.writeSecret || writeSecret)(out, token);
  } catch (error) {
    say(`failed:      the token could not be written (${(error && error.code) || "unknown"})`);
    return 1;
  }

  const user = (session && session.user) || {};
  say(`signed in:   subject ${user.id || "(not reported)"}`);
  if (typeof session.expires_in === "number") {
    say(`expires:     in ${Math.round(session.expires_in / 60)} minutes`);
  }
  say(`confirmed:   ${user.email_confirmed_at ? "the provider records this address as confirmed" : "NOT YET — the provider reports no confirmation"}`);
  say("");
  say("The access token is in the file above. It was not printed and is not in your");
  say("shell history. Check it end to end, exactly as a real request would:");
  say("");
  say(`  npm run auth:check -- --token-file=${out}`);
  say("");
  say("Delete the file when you are done with it. It expires on its own, but sooner");
  say("is better, and nothing keeps a copy.");
  return 0;
}

module.exports = { signIn, endpoints, mustBeIgnored, writeSecret, askForCode,
  refusal, DEFAULT_OUT, LOOKS_LIKE_CODE };
