/* ============================================================================
   REGISTRATION — HOW A TRUSTED PARTNER COMES INTO BEING (Phase 3 Batch 5)

     registerPartner(state, { name, invitationId }, ctx)
       -> { ok, state, value: { id, partner } } | { ok:false, refused }

   Every other mutation in MetYet is a command in metyet-commands.js, and every
   command begins by resolving an actor that already exists (resolveActor). That
   is the whole point of the actor model: nothing happens except as somebody who
   is already here. It is also exactly why the first Trusted Partner could not be
   created — there was nobody to be.

   So this is the one authoring path whose authority is NOT an actor, and it
   lives in its own module to make that visible rather than hiding it as a
   command with a special case. Its authority is a redeemed invitation, checked
   by the server before this function is called (server/registration.js), and it
   is deliberately unreachable from POST /api/commands: it is not in COMMANDS, so
   no request body can name it. There is no other way into it.

   WHAT IT CREATES, AND NOTHING MORE. One partner record: an id, the name MetYet
   approved, and when it was registered. No inventory, no relationships, no
   collectors, no goals, no opportunities, no conversations, no example data of
   any kind — a Trusted Partner's first act is to add their own inventory, and
   they start from an empty shop. `tradeRate`, `city`, `about` and the rest of
   the profile are theirs to fill in afterwards with updatePartnerProfile, which
   is a command like everything else, because by then they exist.

   Like every command it is a pure function of state, payload and the runtime
   context: it validates first and returns either the complete next state or a
   refusal, so a refusal changes nothing. The id and the timestamp come from
   ctx, never from a caller.
   ========================================================================== */

const D = require("./metyet-domain.js");

const R = D.REFUSE;
const list = (xs) => (Array.isArray(xs) ? xs : []);
const refuse = (code) => ({ ok: false, refused: code });

/* A store name a person could read back: trimmed, one line, not empty, and not
   so long that it is really a description. */
const MAX_NAME = 80;
function cleanName(value) {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  return name.length > 0 && name.length <= MAX_NAME ? name : null;
}

/* Two shops may legitimately share a name; two RECORDS may not be the same
   shop registered twice. Identity is the id, so the only duplicate this can
   detect — and the only one that matters — is the same invitation redeemed
   into two partners. The server's single-use redemption makes that impossible;
   this refuses it anyway, because a world is easier to trust when the rule is
   stated where the record is made. */
function registerPartner(state, { name, invitationId } = {}, ctx) {
  if (!state || typeof state !== "object") return refuse(R.notFound);
  const cleaned = cleanName(name);
  if (!cleaned) return refuse(R.nameRequired);
  if (typeof invitationId !== "string" || !invitationId) return refuse(R.invitationRequired);
  if (list(state.partners).some((p) => p.registeredFrom === invitationId)) return refuse(R.alreadyRegistered);

  const id = ctx.id("p");
  if (list(state.partners).some((p) => p.id === id)) return refuse(R.alreadyRegistered);

  /* `since` is what every other partner record carries and what a Collector is
     shown; `registeredFrom` is the audit trail back to the invitation. */
  const partner = { id, name: cleaned, since: ctx.at, registeredFrom: invitationId };
  return { ok: true, state: { ...state, partners: [...list(state.partners), partner] }, value: { id, partner } };
}

module.exports = { registerPartner, cleanName, MAX_NAME };
