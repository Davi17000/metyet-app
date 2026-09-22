/* ============================================================================
   THE ONLY FILE IN THE BROWSER THAT NAMES A COMMAND

     const onSaveProfile = savePartnerProfile(store)
     await onSaveProfile({ about, specialties, website, instagram, email, phone })

   Phase 4 built the authenticated mutation boundary and deliberately left it
   with no caller. This is the first caller, and it is one function.

   WHY A FILE OF ITS OWN, FOR ONE LINE. Three rules meet here and each of them
   is easier to keep when there is exactly one place to look.

   A SCREEN RECEIVES A CALLBACK, NOT A STORE. `client/tp/**` holds no store,
   no session and no client, and a test keeps it that way. A section that could
   reach a store could send any command; a section handed `onSave(patch)` can
   save a profile and do nothing else. So the binding happens outside the
   product surface, and what crosses into it is a function of one argument.

   THE COMMAND NAME LIVES IN ONE PLACE. A command spelled in a screen is a
   command spelled again in the next screen, and two spellings that drift is how
   a mutation quietly stops working. Every future control adds a line here.

   THE PAYLOAD CARRIES NO AUTHORITY. `updatePartnerProfile` takes a `patch` and
   nothing else: the partner whose profile is edited is the ACTOR's, derived by
   the server from the bearer token, and the command never reads an owner from
   what was sent. There is no partnerId to omit here, because there was never
   one to send — see domain/metyet-commands.js. The server refuses `actor`,
   `seat`, `role`, `by`, `account`, `accountId`, `subject`, `sub`, `token` and
   `at` outright, so a payload that grew one would be rejected rather than
   honoured.

   NOTHING HERE RETRIES. The returned promise resolves with the boundary's own
   answer — `{ ok: true, state }` or `{ ok: false, refused }` — and rejects when
   the request could not be made or the world moved first. A caller decides what
   to do about that; this does not decide for them, because a mutation sent
   twice is two mutations and no code in a browser can tell whether the first
   one landed.
   ========================================================================== */

/* The domain's own spelling. Exported so a test can assert the browser asks for
   this command and not a near-miss of it. */
export const PARTNER_PROFILE = "updatePartnerProfile";

/* The fields `updatePartnerProfile` accepts, in the domain's own order. Every
   one of them is intentionally visible to a related Collector
   (PARTNER_FOR_COLLECTOR); none is private configuration. The default Trade %
   IS private configuration, and is deliberately absent — the command does not
   accept it and this batch does not add it. */
export const PROFILE_FIELDS = Object.freeze(["about", "specialties", "website",
  "instagram", "email", "phone"]);

export function savePartnerProfile(target) {
  if (!target || typeof target.execute !== "function") {
    throw new TypeError("savePartnerProfile: the production store is required");
  }
  return (patch) => target.execute(PARTNER_PROFILE, { patch });
}

/* ------------------------------------------- COLLECTOR INVITATIONS (B2)

   OPENING ONE RETURNS A SECRET, ONCE. The reply carries a credential beside the
   projection, so this goes through the store's own invitation call rather than
   `execute` — same state machine, same one-at-a-time gate, same conflict and
   refusal handling, and one thing more to hand back. Nothing here keeps it: the
   credential is returned to the caller and this module forgets it.

   THE SCREEN SENDS TWO LABELS. A recipient and a note, both optional, both for
   the partner's own recognition. Who may redeem an invitation is not decided by
   either of them — the invitation names nobody, and possession plus an
   authenticated identity is what Batch 3 will turn into a Relationship.

   AND, SINCE B3B-2, ONE DESTINATION. An optional email address: where MetYet
   sends the invitation, which is a third thing that decides nothing about who
   may accept it. It is passed through untouched — this module holds no address
   and compares none — and an absent one means the partner will hand the code
   over themselves, which is the path Batch 2 shipped and which still works. */
export const REVOKE_INVITATION = "revokeCollectorInvitation";

export function openCollectorInvitation(target) {
  if (!target || typeof target.createInvitation !== "function") {
    throw new TypeError("openCollectorInvitation: the production store is required");
  }
  return ({ recipient, note, email } = {}) => target.createInvitation({ recipient, note, email });
}

/* Withdrawing one is an ordinary command: there is no secret in the answer, so
   there is no reason for it to travel any way but the usual one. */
export function revokeCollectorInvitation(target) {
  if (!target || typeof target.execute !== "function") {
    throw new TypeError("revokeCollectorInvitation: the production store is required");
  }
  return (invitationId) => target.execute(REVOKE_INVITATION, { invitationId });
}

/* ------------------------------------------- ACCEPTING ONE (Batch 3A)

   ACCEPTANCE IS NOT A COMMAND, AND THIS FILE IS WHERE THAT IS VISIBLE. Every
   other binding here names a command the domain executes for an actor. This one
   names none, because the person accepting is not an actor yet — they have no
   seat until the server decides who they are. There is no command name to
   spell, which is precisely why `POST /api/commands` cannot reach it.

   It is bound the same way regardless: a screen receives a function of one
   argument and no store, so the surface that collects an invitation code can
   accept an invitation and do nothing else. */
export function acceptCollectorInvitation(target) {
  if (!target || typeof target.acceptInvitation !== "function") {
    throw new TypeError("acceptCollectorInvitation: the production store is required");
  }
  return (token) => target.acceptInvitation({ token });
}

/* ------------------------------------------- WHO INVITED YOU (Batch 3D)

   NOT A COMMAND EITHER, AND FOR A SECOND REASON. Accepting names no command
   because the person has no seat yet; this names none because it changes
   nothing at all — it asks the server one question and is told one thing, the
   name of the shop whose invitation is in hand.

   It is bound the same way regardless, so the entrance receives a function of
   one argument and no store: a surface that can ask who invited somebody can do
   that and nothing else. */
export function describeCollectorInvitation(target) {
  if (!target || typeof target.describeInvitation !== "function") {
    throw new TypeError("describeCollectorInvitation: the production store is required");
  }
  return (token) => target.describeInvitation({ token });
}

/* ----------------------------------------------------- GOALS (Batch 7)

   A GOAL IS SOMETHING A PERSON SAYS, AND THESE ARE THE ONLY WAYS TO SAY IT.
   Nothing infers demand: there is no binding here that a search, a filter or a
   card being looked at could reach. A Collector names one exact card and says
   how hard they are looking, and that is the whole of it.

   The card is named by an id the server minted. There is no field for a
   collector, because ownership comes from the authenticated actor, and none for
   a partner or a relationship: a Goal is addressed to a Collector's whole
   network by being theirs. */
export function addCollectorGoal(target) {
  if (!target || typeof target.execute !== "function") {
    throw new TypeError("addCollectorGoal: the production store is required");
  }
  /* `desired` JOINED IT IN C3.3, and a canonical Goal must carry it: which copy
     somebody is after is part of saying they want the card, and the server
     refuses `criteria-required` without it. Absent here means the caller stated
     nothing, which the server will refuse — this binding does not invent one,
     because a preference nobody expressed is not a preference. */
  return ({ canonicalCardId, tier, note = null, desired = undefined } = {}) =>
    target.execute("addGoal", { canonicalCardId, tier, note,
      ...(desired === undefined ? {} : { desired }) });
}

/* WHICH COPY THEY ARE AFTER, CHANGED WITHOUT LOSING THE GOAL (C3.3). Separate
   from the tier for the same reason offering is separate from owning: "I want a
   PSA 9 rather than a raw one" and "I am hunting this harder now" are two
   different things a person can say, and a single command would make correcting
   one of them look like changing the other. */
export function setGoalCriteria(target) {
  if (!target || typeof target.execute !== "function") {
    throw new TypeError("setGoalCriteria: the production store is required");
  }
  return (goalId, desired) => target.execute("updateGoalCriteria", { goalId, desired });
}

/* CHANGING YOUR MIND ABOUT HOW HARD YOU ARE LOOKING. It changes what you mean,
   never which card you mean — there is no card in this payload at all. */
export function setGoalPriority(target) {
  if (!target || typeof target.execute !== "function") {
    throw new TypeError("setGoalPriority: the production store is required");
  }
  return (goalId, tier) => target.execute("updateGoalTier", { goalId, tier });
}

export function removeCollectorGoal(target) {
  if (!target || typeof target.execute !== "function") {
    throw new TypeError("removeCollectorGoal: the production store is required");
  }
  return (goalId) => target.execute("removeGoal", { goalId });
}

/* ------------------------------------------------- INVENTORY (Batch 6)

   ADDING A COPY IS NAMING A CARD AND DESCRIBING AN OBJECT. The card is named
   by an id the server minted and the browser merely received; everything else
   describes the physical thing on the shelf — what grade it carries, what
   condition it is in, what it cost, what it is being asked for.

   There is no field here for a partner, because ownership is not a thing a
   caller states: the server takes it from the authenticated actor and would
   ignore anything sent. And there is no field for a card's name, set, number,
   finish or language, because a copy REFERS to a card rather than describing
   one — a surface that could describe one could invent one. */
export function addInventoryCopy(target) {
  if (!target || typeof target.execute !== "function") {
    throw new TypeError("addInventoryCopy: the production store is required");
  }
  return ({ canonicalCardId, grade = null, condition = null, ask = null,
    cost = null, acquired = null, cert = null, note = null } = {}) =>
    target.execute("addInventoryCopy", { copy: { canonicalCardId, grade, condition,
      ask, cost, acquired, cert, note } });
}

/* ------------------------------------- A COLLECTOR'S OWN CARDS (Phase 5 C2)

   OWNING AND OFFERING ARE TWO SENTENCES, SO THEY ARE TWO BINDINGS.

   Before C2 they were one. A Collector's copy existed only because they had put
   it up for trade, so "I own this" could not be said on its own, and "I'm not
   trading this any more" could only be said by deleting the record — throwing
   away the photographs, the certificate and the fact of ownership to change an
   answer about willingness. This file could not have bound them separately,
   because the domain did not have them separately.

   Now it does. `addOwnedCopy` records the object. `setCopyOffered` says what the
   owner is currently willing to do with it, and it is the ONLY way to say that:
   `offered` is refused inside an update patch, so a screen editing a value can
   never change what the card is doing in the world. `removeOwnedCopy` says the
   card has left the Collector's hands, which is the only thing deletion means
   now.

   NO OWNER FIELD, for the same reason inventory has none: the Collector is the
   authenticated actor and the server would ignore anything sent. NO CARD
   DESCRIPTION, for the same reason: a copy REFERS to a card by an id the server
   minted, and a surface that could describe one could invent one.

   NO PHOTOGRAPHS ARE REQUIRED HERE. They are required where the card is handed
   to somebody else to value — see proposeTradeSelection. A Collector with a
   shoebox and no lightbox can record what they own today and photograph it
   later, which is the whole point of separating the two acts. */
export function addOwnedCopy(target) {
  if (!target || typeof target.execute !== "function") {
    throw new TypeError("addOwnedCopy: the production store is required");
  }
  return ({ canonicalCardId, grade = null, condition = null, market = null,
    cert = null, note = null, offered = false } = {}) =>
    target.execute("addCollectorCopy", { copy: { canonicalCardId, grade, condition,
      market, cert, note, offered } });
}

export function setCopyOffered(target) {
  if (!target || typeof target.execute !== "function") {
    throw new TypeError("setCopyOffered: the production store is required");
  }
  return (copyId, offered) => target.execute("setCollectorCopyOffered", { copyId, offered });
}

export function removeOwnedCopy(target) {
  if (!target || typeof target.execute !== "function") {
    throw new TypeError("removeOwnedCopy: the production store is required");
  }
  return (copyId) => target.execute("removeCollectorCopy", { copyId });
}

/* CORRECTING WHAT A COPY IS (Phase 5 C3.3). C2 wrote this command and left it
   unexposed with a note: it would join the product in the batch that gave it a
   screen. This is that batch.

   `offered` IS NOT IN THE PATCH, and the server refuses it there. Willingness
   has its own command above, so that "I am not selling this" and "I was wrong
   about the certificate" are never the same edit — and so that a person fixing
   a typo cannot accidentally withdraw a card from their partners. Nor is the
   card: a copy's identity is immutable, and a copy of a different card is a
   different copy. */
export function updateOwnedCopy(target) {
  if (!target || typeof target.execute !== "function") {
    throw new TypeError("updateOwnedCopy: the production store is required");
  }
  return (copyId, patch) => target.execute("updateCollectorCopy", { copyId, patch });
}

/* ------------------------------------------------- BINDERS (Phase 5 C3.3)

   WHERE A CARD BELONGS, WHICH IS NOT WHETHER IT IS WANTED OR OWNED. C3.1 built
   the concept and deliberately shipped no way to reach it; these three are the
   Card Specification panel's controls, and they are the whole of what that
   panel needs: make a binder, put this card in one, take it out again.

   THE TWO MEMBERSHIP COMMANDS ARE IDEMPOTENT at the domain, which is what makes
   a second press of Commit safe after a partial one. `createBinder` is not —
   it mints identity — so nothing here retries it on the caller's behalf.

   RENAMING AND ARCHIVING ARE NOT HERE. They are binder management, they have no
   control on this panel, and C3.4 is the batch that gives them one. */
export function createBinder(target) {
  if (!target || typeof target.execute !== "function") {
    throw new TypeError("createBinder: the production store is required");
  }
  return (name) => target.execute("createBinder", { name });
}

export function fileCardInBinder(target) {
  if (!target || typeof target.execute !== "function") {
    throw new TypeError("fileCardInBinder: the production store is required");
  }
  return (binderId, canonicalCardId) =>
    target.execute("addBinderEntry", { binderId, canonicalCardId });
}

export function unfileCardFromBinder(target) {
  if (!target || typeof target.execute !== "function") {
    throw new TypeError("unfileCardFromBinder: the production store is required");
  }
  return (binderId, canonicalCardId) =>
    target.execute("removeBinderEntry", { binderId, canonicalCardId });
}

/* Looking for a card to add. Three reads, no writes: the browse query, one
   context with the printings a person may choose between, and the description
   of cards a screen already holds ids for. A surface that can find a card can
   do that and nothing else. */
export function browseCards(target) {
  if (!target || typeof target.findCards !== "function") {
    throw new TypeError("browseCards: the production store is required");
  }
  return {
    find: (query) => target.findCards(query),
    read: (cardContextId) => target.readCard(cardContextId),
    describe: (ids) => target.describeCards(ids),
    /* The two doorways that are lists rather than cards (C1). Same door, same
       read, and nothing here can write — `browseCards` never had a command in
       it and still does not. */
    expansions: (query) => target.findCards(query, "expansions"),
    artists: (query) => target.findCards(query, "artists"),
  };
}

/* Re-reading is not a mutation and is safe to repeat, which is why an ambiguous
   write may end in one: a screen that cannot know whether something was created
   can at least ask what exists now. It is a GET; nothing is replayed. */
export function refreshView(target) {
  if (!target || typeof target.load !== "function") {
    throw new TypeError("refreshView: the production store is required");
  }
  return () => target.load();
}
