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

/* ============================================================================
   ACCEPTANCE — HOW A COLLECTOR COMES INTO BEING, AND JOINS A NETWORK
   (Phase 5 Batch 3A)

     acceptCollectorInvitation(state, { invitationId, collectorId }, ctx)
       -> { ok, state, value: { collectorId, collectorCreated, relationshipCreated } }
        | { ok:false, refused }

   The second authoring path whose authority is not an actor, and it is here for
   the same reason registerPartner is: the person redeeming may be authenticated
   at the identity provider and be NOBODY in MetYet. resolveActor cannot produce
   a seat for them, so execute() could not run this, so it cannot be a command —
   and because it is not in COMMANDS, no request body can name it and
   POST /api/commands cannot reach it. That is a structural guarantee rather
   than a check somebody has to remember, which is the same fix Batch 2 used on
   inviteCollector.

   ONE OPERATION, BECAUSE THERE IS NO VALID STATE BETWEEN THE PARTS. Accepting
   creates a Collector (sometimes), creates a Relationship (usually), and stamps
   the invitation — and validateWorld rejects an accepted invitation that names
   nobody (metyet-world.js). So there is no intermediate world worth saving and
   nothing to split into two commands.

   `collectorId` IS THE CALLER'S ANSWER TO ONE QUESTION, NOT AN IDENTITY CLAIM.
   The server passes the Collector the authenticated subject already resolves to,
   or null to mean "this person is new". It is read from the account directory
   INSIDE the transaction that runs this — never from a request body, and never
   from the invitation's recipient hint, which decides nothing.

   WHAT IT WILL NOT DO. It will not invent a name. A newly created Collector is
   an id and nothing else, because the only name that would be available is the
   hint the inviting partner typed for their own recognition, and a hint that
   became somebody's name would be a hint that decided something. The person
   names themselves. Until they do, the inviting partner can label their own card
   from their own hint, which never leaves that partner's projection.

   WHAT IT CONVERGES ON. A Relationship per partner-collector pair, using the
   same "current" test the domain, the projection and the schema already use
   (isRelated / isCurrent / relationships_one_current_per_pair). Re-accepting
   into a network somebody is already in adds nothing and is not an error: two
   invitations from one shop are two invitations, not two relationships. */

const { isRelated } = require("./metyet-commands.js");

function acceptCollectorInvitation(state, { invitationId, collectorId = null } = {}, ctx) {
  if (!state || typeof state !== "object") return refuse(R.invitationUnusable);
  if (typeof invitationId !== "string" || !invitationId) return refuse(R.invitationRequired);
  const at = ctx && ctx.at;
  if (!at) return refuse(R.invitationUnusable);

  const invitation = list(state.invitations).find((i) => i.id === invitationId) || null;
  /* Missing, expired, withdrawn, already accepted — one answer. The caller has
     already spent a genuine credential to get here, so this is not an
     enumeration surface; saying less costs nothing and keeps the refusal
     vocabulary honest at the boundary, where it IS one. */
  if (!D.invitationOpen(invitation, at)) return refuse(R.invitationUnusable);
  if (!list(state.partners).some((p) => p.id === invitation.partnerId)) return refuse(R.invitationUnusable);

  /* Resolve or create. A named collector must be real; an unnamed one is made
     here, with an id from the runtime and nothing else. */
  let id = collectorId;
  let collectorCreated = false;
  let collectors = list(state.collectors);
  if (id != null && id !== "") {
    if (!collectors.some((c) => c.id === id)) return refuse(R.notFound);
  } else {
    id = ctx.id("c");
    if (collectors.some((c) => c.id === id)) return refuse(R.alreadyRegistered);
    collectors = [...collectors, { id }];
    collectorCreated = true;
  }

  /* Converge. Already in this network means already in it. */
  const relationshipCreated = !isRelated(state, invitation.partnerId, id);
  const relationships = relationshipCreated
    ? [...list(state.relationships), { partnerId: invitation.partnerId, collectorId: id, status: "accepted", at }]
    : list(state.relationships);

  const invitations = list(state.invitations)
    .map((i) => (i.id === invitationId ? { ...i, collectorId: id, acceptedAt: at } : i));

  return {
    ok: true,
    state: { ...state, collectors, relationships, invitations },
    value: { collectorId: id, collectorCreated, relationshipCreated },
  };
}

module.exports = { registerPartner, acceptCollectorInvitation, cleanName, MAX_NAME };
