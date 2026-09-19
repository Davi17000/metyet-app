/* ============================================================================
   SENDING ONE EMAIL — THE WHOLE OF MetYet'S RELATIONSHIP WITH A MAIL PROVIDER

     const mailer = createResendMailer({ apiKey, from, fetchImpl, timeoutMs })
     await mailer.send({ to, subject, text, idempotencyKey })
       -> { ok: true }
        | { ok: false, failure: "rejected" | "unavailable"
                              | "unreachable" | "unexpected" }

   NO SDK, AND THAT IS NOT A PREFERENCE. This server already talks to an
   identity provider over bare `fetch` with a timeout and no library
   (client/supabase-auth.js, server/auth/identity.js), and a test pins the
   dependency list to exactly what the server needs. One HTTP call does not
   earn a vendor package, and a vendor package would earn a place in every
   future audit of what this process can do.

   ONLY THIS FILE KNOWS WHO THE PROVIDER IS. Everything above it asks for an
   email to be sent and is told whether that worked. Changing provider is
   changing this file.

   WHAT COMES BACK IS ONE OF FOUR WORDS OF OURS.

     rejected      the provider considered it and said no — a bad address, a
                   sender that is not verified. Trying the same thing again
                   will fail the same way, so the partner must change something.
     unavailable   the provider answered and did not take it: too many requests,
                   or its own fault. It did NOT go out, and it may next time.
     unreachable   no answer at all — refused, timed out, DNS. It may have gone
                   out; nobody can tell from here, and nobody should claim to.
     unexpected    an answer in a shape this does not understand. Also unknown.

   THE LAST TWO ARE THE HONEST ONES, and the distinction from `unavailable` is
   the whole reason there are four words rather than three. A 429 means the
   message was not accepted; a timeout means the connection died somewhere
   between here and a mail server that may already have queued it. Only the
   first of those may be recorded as a failure. The second is recorded as
   nothing, and the invitation says MetYet does not know.

   THE PROVIDER'S OWN WORDS NEVER LEAVE THIS FILE. Not returned, not logged,
   not stored. A provider's error body can quote back the request that caused
   it, and that request contained an invitation credential. The same rule
   client/supabase-auth.js already follows, for the same reason.

   IDEMPOTENCY IS PER ISSUANCE, NEVER PER INVITATION. A repeated key returns
   the provider's CACHED answer rather than sending again — so a key that named
   only "this person's invitation" would silently swallow the replacement that a
   partner sent precisely because the first one failed. Every issuance is a new
   invitation with a new credential, so the invitation's own id is already
   unique per issuance, and that is what callers pass.
   ========================================================================== */

const ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_TIMEOUT_MS = 10000;

const FAILURES = Object.freeze({
  rejected: "rejected",
  unavailable: "unavailable",
  unreachable: "unreachable",
  unexpected: "unexpected",
});
/* The two the provider actually answered. Everything else left the question
   open, and a caller must not record an open question as a failure. */
const ANSWERED = Object.freeze([FAILURES.rejected, FAILURES.unavailable]);

class MailError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MailError";
    this.code = code;
  }
}

const trimmed = (v) => (typeof v === "string" ? v.trim() : "");

/* A status, and nothing else, decides the word. The body is not read. */
const failureFor = (status) => {
  if (status >= 200 && status < 300) return null;
  if (status === 429 || status >= 500) return FAILURES.unavailable;
  if (status >= 400) return FAILURES.rejected;
  return FAILURES.unexpected;
};

function createResendMailer({ apiKey, from, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!trimmed(apiKey)) throw new MailError("mail.no-key", "createResendMailer: an API key is required");
  if (!trimmed(from)) throw new MailError("mail.no-sender", "createResendMailer: a sender address is required");
  const send = fetchImpl || ((url, init) => fetch(url, init));

  return {
    /* Never throws for a provider outcome: a send that failed is an answer the
       caller has to record, not an exception that loses the invitation. */
    async send({ to, subject, text, html = null, idempotencyKey = null } = {}) {
      if (!trimmed(to) || !trimmed(subject) || !trimmed(text)) {
        throw new MailError("mail.incomplete", "send: a recipient, a subject and a body are required");
      }
      const headers = {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
      };
      if (trimmed(idempotencyKey)) headers["Idempotency-Key"] = trimmed(idempotencyKey);

      let response;
      try {
        response = await send(ENDPOINT, {
          method: "POST",
          headers,
          body: JSON.stringify({ from, to: [to], subject, text, ...(html ? { html } : {}) }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        /* Timed out, refused, DNS — the message may or may not have gone, and
           the provider's own error is not read, logged or returned. */
        return { ok: false, failure: FAILURES.unreachable };
      }
      const status = response && typeof response.status === "number" ? response.status : null;
      if (status === null) return { ok: false, failure: FAILURES.unexpected };
      const failure = failureFor(status);
      return failure ? { ok: false, failure } : { ok: true };
    },
  };
}

module.exports = { createResendMailer, MailError, FAILURES, ANSWERED, ENDPOINT };
