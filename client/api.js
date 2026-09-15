/* ============================================================================
   THE ONE PLACE THE CLIENT TALKS TO THE SERVER

     const api = createApiClient({ baseUrl, getToken })
     await api.view()                     -> { version, state }
     await api.command(name, payload)     -> { ok: true,  version, value, state }
                                           | { ok: false, refused, version }

   Two calls, because the server has two: read what I am allowed to see, and ask
   for something to happen. Everything a production screen needs goes through
   one of them, and nothing else in the client may hold a URL or a token.

   WHAT IS SENT, AND WHAT IS NOT. The bearer, and the command's own payload.
   Never an actor, a seat, a subject, a partner id or a collector id — the
   server derives who you are from the token it verified, and a client that
   also sent an identity would be inviting the server to believe it. There is
   no field here for one, deliberately: a caller that wants to impersonate
   somebody has nowhere to put it.

   WHAT COMES BACK IS THE ANSWER, NOT A SUGGESTION. `state` is the server's
   projection for whoever the token turned out to be. This module does not
   merge it, patch it, or reconcile it with anything: it returns it. Nothing
   here computes state, and nothing here knows what a card or a deal is.

   FAILING CLOSED. Every failure — a refusal, a 401, an unreachable server,
   a body that will not parse — resolves to a shape the caller must handle,
   and never to something that could be mistaken for success. A thrown error
   from this module means the request did not happen.
   ========================================================================== */

/* The same rule the server and the operator commands are held to: a bearer
   token may not cross a plaintext connection to anywhere but this machine. One
   definition, so a browser build and a Node test cannot disagree about it. */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isSafeApiUrl(value) {
  if (typeof value !== "string" || !value) return false;
  let url;
  try { url = new URL(value); } catch (error) { return false; }
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOOPBACK.has(url.hostname);
}

/* The vocabulary a caller may branch on. Small on purpose: a screen that wants
   to know WHY something failed should be asking about `refused`, which is the
   domain's own word for it, not parsing a sentence. */
export const FAILURES = Object.freeze({
  unauthenticated: "unauthenticated",   // no token, or the server would not take it
  notProvisioned: "not-provisioned",    // verified, but nobody in MetYet yet
  refused: "refused",                   // the domain said no, and said why
  unavailable: "unavailable",           // unreachable, timed out, or 5xx
  unexpected: "unexpected",             // a shape this client does not understand
});

export class ApiError extends Error {
  constructor(failure, { status = null, refused = null, detail = null } = {}) {
    super(failure);
    this.name = "ApiError";
    this.failure = failure;
    this.status = status;
    this.refused = refused;
    /* A word of our own, for a log. Never the server's message: a 4xx from
       something that is not MetYet can put anything in a body. */
    this.detail = detail;
  }
}

const DEFAULT_TIMEOUT_MS = 15000;

const failureFor = (status, code) => {
  if (status === 401) return FAILURES.unauthenticated;
  if (code === "account_not_provisioned" || code === "account_disabled") return FAILURES.notProvisioned;
  if (status === 403) return FAILURES.notProvisioned;
  if (status >= 500 || status === 503) return FAILURES.unavailable;
  return FAILURES.unexpected;
};

export function createApiClient({ baseUrl, getToken, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = {}) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  if (!isSafeApiUrl(base)) {
    throw new TypeError("createApiClient: the API URL must be https (http only for this machine). "
      + "Every request carries a bearer token.");
  }
  if (typeof getToken !== "function") {
    throw new TypeError("createApiClient: getToken must be a function. The token is asked for per "
      + "request rather than captured, so a session that changes is not held open by this client.");
  }

  async function send(path, { method = "GET", body } = {}) {
    /* Asked for each time. A client that captured the token at construction
       would keep using a session after it was replaced or ended. */
    const token = await getToken();
    if (typeof token !== "string" || !token) throw new ApiError(FAILURES.unauthenticated, { detail: "no token" });

    let response;
    try {
      response = await (fetchImpl || fetch)(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      /* A timeout, a DNS failure, an offline browser. The request did not
         happen, so nothing about the world is known either way. */
      throw new ApiError(FAILURES.unavailable, { detail: "unreachable" });
    }
    if (!response || typeof response.status !== "number") {
      throw new ApiError(FAILURES.unexpected, { detail: "unreadable response" });
    }

    let payload = null;
    try { payload = await response.json(); } catch (error) { payload = null; }
    return { status: response.status, payload };
  }

  return {
    /* The server's projection for whoever this token is. */
    async view() {
      const { status, payload } = await send("/api/view");
      if (status === 200) {
        if (!payload || typeof payload !== "object" || !payload.state) {
          throw new ApiError(FAILURES.unexpected, { detail: "no state in a 200" });
        }
        return { version: payload.version, state: payload.state };
      }
      const code = payload && payload.error && payload.error.code;
      throw new ApiError(failureFor(status, code), { status, detail: code || null });
    },

    /* Ask for something to happen. A refusal is an ANSWER, not an error: the
       domain considered it and said no, and the caller wants the word. */
    async command(command, payload = {}) {
      if (typeof command !== "string" || !command) {
        throw new TypeError("api.command: a command name is required");
      }
      const { status, payload: body } = await send("/api/commands", { method: "POST", body: { command, payload } });
      if (status === 200) {
        if (!body || typeof body !== "object" || !body.state) {
          throw new ApiError(FAILURES.unexpected, { detail: "no state in a 200" });
        }
        return { ok: true, version: body.version, value: body.value === undefined ? null : body.value, state: body.state };
      }
      const error = body && body.error;
      const refused = error && typeof error.refused === "string" ? error.refused : null;
      if (status === 409 && refused) return { ok: false, refused, version: body && body.version };
      throw new ApiError(failureFor(status, error && error.code), { status, refused, detail: (error && error.code) || null });
    },
  };
}
