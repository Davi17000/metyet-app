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

   FAILING CLOSED. Every failure — a refusal, a 401, a conflict, an unreachable
   server, a body that will not parse — resolves to a shape the caller must
   handle, and never to something that could be mistaken for success.

   THREE OUTCOMES, AND THEY ARE NOT THE SAME THING. A REFUSAL is the domain
   considering the request and saying no; it comes back as a value, because the
   caller wants the word. A CONFLICT is the world having moved before the save
   landed — the server's transaction rolled back, so nothing was written; it
   throws, with `failure === "conflict"`, because the caller must re-read rather
   than carry on. EVERYTHING ELSE throws too, and a thrown `unavailable` means
   the request did not reach the server at all.
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
  conflict: "conflict",                 // the world moved first; nothing was written
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
  /* THE WORLD MOVED FIRST. `state_changed` is the server's word for a save
     whose expected version no longer matched, and the transaction that carried
     it ROLLED BACK — so nothing was written and the command did not run. It
     arrives as a 409 with no `refused`, because it is not the domain declining
     anything; without this line it would land in `unexpected` and be
     indistinguishable from a reply this client cannot read. A caller must be
     able to tell those apart: one means re-read and try again, the other means
     something is wrong with the client or the server. */
  if (status === 409 && code === "state_changed") return FAILURES.conflict;
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

  /* ONE TRANSPORT, SO THERE IS ONE PLACE A REQUEST CAN GO WRONG. A timeout, a
     DNS failure, an offline browser: the request did not happen, so nothing
     about the world is known either way. An answer that is not a response, or
     not JSON, is a shape this client does not understand. */
  async function roundTrip(path, { method, body, token }) {
    let response;
    try {
      response = await (fetchImpl || fetch)(`${base}${path}`, {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new ApiError(FAILURES.unavailable, { detail: "unreachable" });
    }
    if (!response || typeof response.status !== "number") {
      throw new ApiError(FAILURES.unexpected, { detail: "unreadable response" });
    }
    let payload = null;
    try { payload = await response.json(); } catch (error) { payload = null; }
    return { status: response.status, payload };
  }

  /* THE ONE REQUEST THAT CARRIES NO TOKEN (Phase 5 Batch 3D). `send` demands
     one, which is what stops a failed sign-in from quietly becoming an
     anonymous request. Asking who invited you happens BEFORE there is a session
     to carry — so rather than teach `send` an exception, which would make every
     call a candidate for one, anonymity is its own named door with exactly one
     caller, and a test holds it to one. */
  const ask = (path, body) => roundTrip(path, { method: "POST", body });

  /* A 200 THAT CARRIES NO PROJECTION IS NOT AN ANSWER (Phase 5 Batch 6 —
     three callers said this separately and now say it once). The server always
     sends the actor's state back with a success; a reply without one is a shape
     this client does not understand, and adopting it would leave a screen
     rendering whatever it happened to hold before. */
  const failed = (status, b, refused = null) => {
    const code = b && b.error && b.error.code;
    return new ApiError(failureFor(status, code), { status, refused, detail: code || null });
  };
  const withState = (b) => {
    if (!b || !b.state) throw new ApiError(FAILURES.unexpected, { detail: "no state in a 200" });
    return b;
  };

  async function send(path, { method = "GET", body } = {}) {
    /* Asked for each time. A client that captured the token at construction
       would keep using a session after it was replaced or ended. */
    const token = await getToken();
    if (typeof token !== "string" || !token) throw new ApiError(FAILURES.unauthenticated, { detail: "no token" });
    return roundTrip(path, { method, body, token });
  }

  return {
    /* The server's projection for whoever this token is. */
    async view() {
      const { status, payload } = await send("/api/view");
      if (status === 200) {
        const body = withState(payload);
        return { version: body.version, state: body.state };
      }
      throw failed(status, payload);
    },

    /* READING THE CATALOG (Phase 5 Batch 6). One door for every card read, so
       the client gains a way to LOOK at cards without gaining a way to make
       one: there is no card write here and no request body. What comes back is
       the server's own vocabulary — MetYet ids, MetYet words — and the caller
       composes the path, because a browse query is the caller's question. */
    async catalog(path) {
      const { status, payload } = await send(`/api/${path}`);
      if (status === 200 && payload) return payload;
      throw failed(status, payload);
    },

    /* Ask for something to happen. A refusal is an ANSWER, not an error: the
       domain considered it and said no, and the caller wants the word. */
    async command(command, payload = {}) {
      if (typeof command !== "string" || !command) {
        throw new TypeError("api.command: a command name is required");
      }
      const { status, payload: body } = await send("/api/commands", { method: "POST", body: { command, payload } });
      if (status === 200) {
        withState(body);
        return { ok: true, version: body.version, value: body.value === undefined ? null : body.value, state: body.state };
      }
      const refused = typeof (body && body.error && body.error.refused) === "string" ? body.error.refused : null;
      if (status === 409 && refused) return { ok: false, refused, version: body && body.version };
      throw failed(status, body, refused);
    },

    /* OPEN A COLLECTOR INVITATION (Phase 5 Batch 2). A third call, because the
       reply carries one thing `command` cannot: the credential that will redeem
       the invitation, returned exactly once and never obtainable again.

       It is the same shape of answer otherwise — a refusal is a value, a
       conflict throws, and the projection comes back to be adopted. The
       credential is a sibling of `state`, never inside it: a projection is read
       again on every refresh, and a secret that can be re-read is not a secret
       shown once. Nothing here stores it. */
    async createCollectorInvitation({ recipient = null, note = null, email = null } = {}) {
      /* The delivery address is sent only when there is one. A server with no
         mail configured refuses fields it does not offer, so an absent address
         must be an absent field rather than an explicit null — that is what
         keeps one client working against both shapes of deployment. */
      const address = typeof email === "string" ? email.trim() : "";
      const { status, payload: body } = await send("/api/invitations/collector",
        { method: "POST", body: { recipient, note, ...(address ? { email: address } : {}) } });
      if (status === 200) {
        withState(body);
        if (typeof body.credential !== "string" || !body.credential) {
          /* A created invitation whose credential did not arrive is exactly the
             ambiguous case: it may well exist, and its secret is already
             unrecoverable. Say so rather than pretending either way. */
          throw new ApiError(FAILURES.unexpected, { detail: "no credential in a 200" });
        }
        /* What the server says happened to the send, believed exactly as far as
           it goes: absent means nothing was asked for. The screen never infers
           delivery from the fact that an address was typed. */
        const delivery = body.delivery && typeof body.delivery === "object"
          ? body.delivery : { requested: false };
        /* The link the server built from its own configured origin, when it has
           one. Absent is a fact, not a fault: the code alone is what Batch 2
           handed over and it still works. */
        return { ok: true, version: body.version, invitationId: body.invitationId || null,
          credential: body.credential,
          joinUrl: typeof body.joinUrl === "string" && body.joinUrl ? body.joinUrl : null,
          delivery, state: body.state };
      }
      const refused = typeof (body && body.error && body.error.refused) === "string" ? body.error.refused : null;
      if (status === 409 && refused) return { ok: false, refused, version: body && body.version };
      throw failed(status, body, refused);
    },

    /* WHO INVITED YOU (Phase 5 Batch 3D). Asked before signing in, so it is the
       one call that carries no token, and the only caller of `ask`.

       A REFUSAL IS AN ANSWER, NOT AN ERROR. An invitation that is not live is
       the ordinary case for a link somebody kept for a month, so it comes back
       as `{ ok: false }` and the entrance shows what it showed before this
       existed. Only losing contact throws. */
    async invitationContext({ token } = {}) {
      if (typeof token !== "string" || !token) {
        throw new TypeError("invitationContext: the invitation code is required");
      }
      const { status, payload: body } = await ask("/api/invitations/collector/context", { token });
      if (status === 200 && body && typeof body.partnerName === "string" && body.partnerName) {
        return { ok: true, partnerName: body.partnerName };
      }
      /* Anything else — refused, not found, a shape this cannot read — is one
         answer, because the server deliberately gives one. */
      if (status >= 500) throw new ApiError(FAILURES.unavailable, { status });
      return { ok: false };
    },

    /* ACCEPT ONE (Phase 5 Batch 3A). The only call in this client a person can
       make before they are anybody in MetYet — so it is the only one whose 403
       does NOT mean "you are not provisioned". Being unprovisioned is the normal
       state of somebody accepting their first invitation; that is what they are
       here to change.

       One field leaves the browser: the credential. There is no collectorId to
       send and no place to put one. The answer is the projection for whoever the
       server decided this person is. */
    async acceptCollectorInvitation({ token } = {}) {
      if (typeof token !== "string" || !token) {
        throw new TypeError("acceptCollectorInvitation: the invitation code is required");
      }
      const { status, payload: body } = await send("/api/invitations/collector/accept",
        { method: "POST", body: { token } });
      if (status === 200) {
        if (!body || typeof body !== "object" || !body.state) {
          throw new ApiError(FAILURES.unexpected, { detail: "no state in a 200" });
        }
        return { ok: true, version: body.version, state: body.state };
      }
      const refused = typeof (body && body.error && body.error.refused) === "string" ? body.error.refused : null;
      if (status === 409 && refused) return { ok: false, refused, version: body && body.version };
      throw failed(status, body, refused);
    },
  };
}
