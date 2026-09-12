/* ============================================================================
   THE API ERROR VOCABULARY — WHAT A CLIENT IS TOLD

   A client receives a stable code, a sentence it can show a person, and the
   request id to quote. It never receives a stack trace, a SQL statement, a
   configuration value, a token claim, or any canonical state.

     unauthenticated          401  no bearer token, or the token did not verify
     account_not_provisioned  403  verified sign-in, no MetYet account
     account_disabled         403  the account has been switched off
     actor_unknown            403  the account names an actor the world lacks
     invalid_request          400  the request body could not be read
     command_refused          409  the domain refused; `refused` names the rule
     state_changed            409  the world moved while the command was in flight
     service_unavailable      503  the database is unreachable
     not_found                404  no such route
     internal_error           500  anything else — logged in full, never returned

   A refusal is not a server failure: it is the domain's answer, and its code is
   already written to name a rule and never another party, a price or a deal, so
   it is safe to pass through unchanged.
   ========================================================================== */

const { CODES } = require("../persistence/errors.js");

const API_ERRORS = Object.freeze({
  unauthenticated: { status: 401, message: "Sign in to continue." },
  account_not_provisioned: { status: 403, message: "This sign-in is not linked to a MetYet account yet." },
  account_disabled: { status: 403, message: "This account is no longer active." },
  actor_unknown: { status: 403, message: "This account's MetYet record is unavailable." },
  invalid_request: { status: 400, message: "The request could not be read." },
  command_refused: { status: 409, message: "That is not something you can do right now." },
  state_changed: { status: 409, message: "Something else changed first. Try again." },
  service_unavailable: { status: 503, message: "MetYet is temporarily unavailable." },
  not_found: { status: 404, message: "There is nothing at this address." },
  internal_error: { status: 500, message: "Something went wrong." },
});

class ApiError extends Error {
  constructor(code, { refused, detail } = {}) {
    const known = API_ERRORS[code] || API_ERRORS.internal_error;
    super(known.message);
    this.name = "ApiError";
    this.code = API_ERRORS[code] ? code : "internal_error";
    this.status = known.status;
    if (refused !== undefined) this.refused = refused;   // a domain refusal code
    if (detail !== undefined) this.detail = detail;      // for the log only
  }
}
const apiError = (code, extra) => new ApiError(code, extra);

/* A persistence failure in client terms. Everything that means "the server or
   its data is wrong" becomes internal_error: a client can do nothing with it,
   and its details belong in the log. */
const PERSISTENCE_TO_API = Object.freeze({
  [CODES.versionConflict]: "state_changed",
  [CODES.database]: "service_unavailable",
});

function toApiError(error) {
  if (error instanceof ApiError) return error;
  /* A body Fastify could not read (bad JSON, wrong content type, too large) is
     the client's to fix, and its message is Fastify's, not ours. */
  if (error && typeof error.code === "string" && error.code.startsWith("FST_ERR_CTP")) {
    return apiError("invalid_request", { detail: error.code });
  }
  if (error && typeof error.code === "string") {
    if (error.code.startsWith("persistence.")) {
      return apiError(PERSISTENCE_TO_API[error.code] || "internal_error", { detail: error.code });
    }
    if (error.code === "token.invalid") return apiError("unauthenticated", { detail: error.reason });
  }
  return apiError("internal_error");
}

/* The body a client receives. `refused` appears only for a domain refusal. */
const errorBody = (error, requestId) => ({
  error: {
    code: error.code,
    message: error.message,
    ...(error.refused !== undefined ? { refused: error.refused } : {}),
    requestId,
  },
});

module.exports = { ApiError, apiError, toApiError, errorBody, API_ERRORS };
