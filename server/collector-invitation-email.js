/* ============================================================================
   WHAT AN INVITATION SAYS WHEN MetYet CARRIES IT

     buildInvitationEmail({ partnerName, appUrl, credential })
       -> { subject, text }

   A pure function of three things, two of which the server knows and one of
   which exists for the length of one request. It reads no configuration, opens
   no connection and decides nothing.

   THE SHOP'S NAME COMES FROM THE WORLD, AND THAT IS THE POINT. The caller reads
   it out of the committed canonical state for the authenticated partner — never
   from a request body, never from a URL. A name a client could choose is a name
   an attacker could choose, and this email is the one place a person decides
   whether to trust an invitation.

   THE LINK AND THE CODE ARE THE SAME SECRET, WRITTEN TWICE. The link is what
   almost everyone will use. The code is for the person reading on a phone who
   wants to finish on a laptop — and, when an email client mangles a long URL,
   the way through anyway. It adds no exposure: both live in this one message.

   WHAT IT MUST NOT IMPLY. Not that the address it arrived at is who the
   invitation belongs to. The recipient signs in with any address they can
   receive mail at, and MetYet never compares the two — so the email says so,
   in the sentence about signing in, rather than leaving a person to assume the
   opposite.

   NO TRACKING. No pixel, no wrapped links, no analytics. A message that reports
   when an invitation was read is a message that reports where somebody was.
   ========================================================================== */

const trimmed = (v) => (typeof v === "string" ? v.trim() : "");

/* A shop that has not named itself is described, not invented. */
const SOMEBODY = "A Trusted Partner on MetYet";

function buildInvitationEmail({ partnerName, appUrl, credential } = {}) {
  const code = trimmed(credential);
  const base = trimmed(appUrl).replace(/\/+$/, "");
  if (!code) throw new TypeError("buildInvitationEmail: the invitation code is required");
  if (!base) throw new TypeError("buildInvitationEmail: the application URL is required");

  const who = trimmed(partnerName) || SOMEBODY;
  const link = `${base}/join#${code}`;
  const host = base.replace(/^https?:\/\//, "");

  const subject = `${who} invited you to MetYet`;

  const text = [
    `${who} uses MetYet to keep track of the cards their collectors are looking for.`,
    "",
    "They have invited you to join their Collector Network:",
    "",
    link,
    "",
    `Or go to ${host} and enter this code:`,
    "",
    `    ${code}`,
    "",
    "You will sign in with your own email address — any address you can receive",
    "mail at, not necessarily the one this reached — and then decide for yourself",
    "whether to accept. Nothing about you is shared until you do.",
    "",
    "This invitation is personal and works once. Please do not forward it.",
    "",
    "— MetYet. This mailbox is not monitored.",
  ].join("\n");

  return { subject, text };
}

module.exports = { buildInvitationEmail, SOMEBODY };
