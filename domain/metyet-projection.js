/* ============================================================================
   THE PROJECTION BOUNDARY — WHAT ONE ACTOR MAY RECEIVE (Phase 2, Batch 1)

     projectForActor(state, actor)  ->  a role-appropriate, relationship-scoped
                                        copy of canonical state

   Contract §3: "Visibility is a domain rule, not a UI convention. Enforce it
   where the data is projected, not on each screen." This module is that place.
   There is one canonical state; every actor receives a different projection of
   it, computed here and nowhere else.

   Two boundaries apply together, exactly as the contract states:

     NETWORK  whose data. A CURRENT ACCEPTED RELATIONSHIP (isRelated) is the only
              thing that puts a counterparty into the actor's network: the
              collector's Trusted Partners and their supply; the partner's
              Collector Network, its Goals, preference tags and offered copies.
              Taking part in a specific record — an Opportunity, a Conversation,
              a photo request, an invitation — makes THAT RECORD visible, and
              names the other party in `counterparties` with bare identity. It
              never adds anyone to the network or to supply.
     FIELD    which fields: explicit allow-lists per entity and per seat, so a
              field nobody has classified is not projected at all.

   Properties:
     - pure and deterministic: canonical state is read, never written; the same
       state and actor give the same output;
     - self-contained: every record in the output is a fresh copy, so nothing in
       a projection refers back into canonical state;
     - identity comes from the Phase 1 actor convention (resolveActor): the seat
       is derived from { partnerId } or { collectorId } and the record existing;
       any seat or owner a caller claims is ignored; an unknown actor receives
       the empty projection;
     - no React, no demo fixtures, no persistence: callable later from a server.

   The output keeps canonical collection names, so a later batch can hand a
   projection to the existing persona selectors in place of the whole world,
   plus two projection-only sections: `counterparties`, bare identity for people
   a projected record names, and `discoveries` (Phase 5 Batch 8), the overlaps
   between Goals and available Copies that this seat already holds both halves
   of. Neither is canonical state and neither is stored.

   PRODUCT DECISIONS ENCODED (Phase 2 D-1 … D-4, and the Batch 1 closeout):
     D-1  Partner-authored relationship metadata (notes, last contact, review
          timestamps) is private to the partner that owns the Relationship. Its
          home is the Relationship record (RELATIONSHIP_PARTNER_PRIVATE), which
          only that partner receives. The prototype also stores such values on
          the canonical Collector row (COLLECTOR_PARTNER_AUTHORED); their author
          cannot be established there, so they are projected to NOBODY.
     D-2  A related partner receives the Collector's preference tags used for
          matching (`prefs`, and `preferences` rows), and nothing else of the
          preference data. Every other partner receives none — including a
          partner with a PENDING INVITATION to that Collector (an invitation is
          not yet a Relationship) and a partner whose Relationship has ended.
     D-3  A related Collector receives only the partner's profile-facing fields
          (PARTNER_FOR_COLLECTOR). The default Trade % (`tradeRate`) is private
          partner configuration: it is stripped from the partner row and from
          every Opportunity the Collector receives. A Trade % reaches the
          Collector only as a submitted proposal inside a trade card. The
          partner `note` is not projected: partners cannot author it
          (updatePartnerProfile excludes it) and the seed uses it both as an
          operator label ("Your shop.") and as a description, so its intent is
          not established as Collector-facing. Privacy defaults closed.
     D-4  Activity is partner-private. A row reaches only the partner named in
          its `partnerId`; a row without one has no established owner and is
          projected to nobody. Collectors receive no activity.
     READ POSITION  An Opportunity's `viewedAt` is each seat's own reading
          position ({ tp: {...}, collector: {...} }). Canonical state keeps both;
          a projection carries only the actor's own seat, and omits the field
          entirely when the actor has never opened the deal — so its presence
          cannot say the other side has. Marking a deal viewed writes nothing
          else, so no other projected field moves either. There are no read
          receipts (Phase 3 Batch 1).
     COPY STATUS  No status in a projection derives from a deal the actor is
          not in. A copy held or consumed by someone else's deal leaves the
          actor's supply exactly as a sold, traded or removed copy does, so
          the other deal's lifecycle cannot be read from it (copyForViewer).
   ========================================================================== */

const D = require("./metyet-domain.js");
const { discoveriesIn } = require("./metyet-discovery.js");
const { resolveActor, isRelated } = require("./metyet-commands.js");

const list = (xs) => (Array.isArray(xs) ? xs : []);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/* A structural copy of plain data. Canonical state is JSON-shaped; nothing a
   projection returns may be the same object as something in canonical state. */
function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v)) out[k] = clone(v[k]);
    return out;
  }
  return v;
}
const pick = (record, keys) => {
  const out = {};
  for (const k of keys) if (has(record, k)) out[k] = clone(record[k]);
  return out;
};
const omit = (record, keys) => {
  const out = {};
  for (const k of Object.keys(record)) if (!keys.includes(k)) out[k] = clone(record[k]);
  return out;
};

/* ------------------------------------------------------------- FIELD RULES
   Allow-lists wherever a record is shown to someone other than its owner, so
   an unclassified field defaults to private. Deny-lists only where the record
   is already the recipient's own or is shared by both participants. */

/* A Collector as a RELATED partner sees them: identity and the network-facing
   matching profile (D-2).

   `pending` WAS HERE AND IS GONE (Phase 5 Batch 3A). It marked a Collector
   record that `inviteCollector` fabricated before anybody had accepted
   anything — the shape Batch 2 removed, because two partners inviting one
   person made two identities. Nothing has set it since, and an allow-list that
   names a field nothing writes is an invitation to start writing it again.
   A Collector now exists only once a real person has accepted, so there is no
   pending one to mark. */
const COLLECTOR_FOR_PARTNER = ["id", "name", "short", "city", "prefs"];
/* A Collector named only by a record the partner takes part in — a deal or a
   thread outside the network: enough to label that record, nothing of the
   network profile. */
const COLLECTOR_IDENTITY = ["id", "name", "short"];
/* Partner-authored relationship metadata the prototype keeps on the canonical
   Collector row (D-1). Never projected — not to a partner, not to the collector. */
const COLLECTOR_PARTNER_AUTHORED = ["note", "since", "last", "binderReviewedAt"];

/* A partner as a RELATED Collector sees them (D-3). `tradeRate`, `since`,
   `note` and any field not listed are not projected. */
const PARTNER_FOR_COLLECTOR = ["id", "name", "city", "about", "specialties",
  "website", "instagram", "email", "phone", "avatar", "logo"];
/* A partner named only by a record the Collector takes part in — an invitation
   they received, a deal or thread with a partner they are not related to. */
const PARTNER_IDENTITY = ["id", "name"];

/* A Relationship belongs to both parties; its partner-authored annotations belong
   to the partner (D-1). */
const RELATIONSHIP_SHARED = ["partnerId", "collectorId", "status", "at"];
const RELATIONSHIP_PARTNER_PRIVATE = ["note", "last", "binderReviewedAt"];

/* An invitation as its invitee sees it: who invited them and when. */
const INVITATION_FOR_INVITEE = ["id", "partnerId", "collectorId", "at", "acceptedAt"];

/* A Goal as a related partner sees it: contract §3 "Goal (card, tier, note)". */
/* A Goal as the Trusted Partner it is addressed to sees it. `canonicalCardId`
   joined the list in Batch 7 because it IS the demand now — a partner told
   somebody wants a card they cannot identify has been told nothing. `tier` was
   always here and is the whole distinction the product turns on: actively
   hunting, or keeping an eye out. Who sees any of this is unchanged and is
   decided elsewhere, by the relationship. */
const GOAL_FOR_PARTNER = ["id", "collectorId", "cardId", "canonicalCardId", "tier",
  "note", "since", "createdAt", "confirmedAt", "secondarySince"];
const PREFERENCE_FOR_PARTNER = ["collectorId", "tags"];

/* An InventoryCopy as a Collector sees it: identity, ask, photos.
   `cost`, `acquired`, `note` and any unlisted field are partner-private.

   `canonicalCardId` joined the list in Batch 6 because it IS the identity now —
   a copy that named a card the viewer could not see would be a copy of nothing.
   `grade` and `condition` joined it because Batch 5 moved them out of card
   identity and onto the copy: they describe the very thing being offered, and
   a Collector who cannot see whether a copy is PSA 9 or heavily played cannot
   tell whether they want it. What stayed off the list is what it always was —
   what the partner paid, when they got it, and what they wrote to themselves. */
const INVENTORY_FOR_COLLECTOR = ["invId", "partnerId", "cardId", "canonicalCardId",
  "grade", "condition", "ask", "cert", "photos", "addedAt", "archived"];

/* A CollectorCopy as a partner sees it: identity, photos, cert. The reference
   value (`market`) and any unlisted field are collector-private.

   `canonicalCardId` joined the list in Batch C2 for the same reason it joined
   INVENTORY_FOR_COLLECTOR in Batch 6 — it IS the identity now, and a copy whose
   card the viewer cannot resolve is a copy of nothing. `grade` and `condition`
   joined it for the same reason they are on the inventory list: they describe
   the very thing being offered, and a partner who cannot see whether a copy is
   PSA 9 or heavily played cannot value it. `offered` joined it because a partner
   who receives the copy at all is being told it is available to them, and the
   field saying so should not be the one thing they have to infer.

   `market` is still not here, and the reason has not changed: it is what the
   Collector thinks the card is worth, which is their side of a negotiation. */
const COLLECTOR_COPY_FOR_PARTNER = ["id", "collectorId", "cardId", "canonicalCardId",
  "grade", "condition", "offered", "photos", "cert", "addedAt", "updatedAt"];

/* A partner's interest as the owning Collector sees it. */
const INTEREST_FOR_COLLECTOR = ["partnerId", "binderId", "at"];

/* An Opportunity is shared by its two participants. Fields that are one side's
   private configuration are removed for the other side (D-3). */
const OPPORTUNITY_PARTNER_PRIVATE = ["tradeRate"];

/* READ POSITION — the actor's own seat, or nothing. `out` is already a fresh
   copy, so it is edited in place. */
const READ_POSITION = "viewedAt";
function ownReadPosition(out, seat) {
  if (!has(out, READ_POSITION)) return out;
  const all = out[READ_POSITION];
  delete out[READ_POSITION];
  if (all && typeof all === "object" && has(all, seat)) out[READ_POSITION] = { [seat]: all[seat] };
  return out;
}

/* A trade package is the collector's private draft until submitted (contract §3
   "Draft negotiation input — own, until submitted"; §4 Select Trade). Commands
   submit a package in one step, so canonical state normally never holds an
   unsubmitted one — but a record that does must not reach the partner. */
const submittedRows = (o) => (o.trade && o.trade.submitted === true ? list(o.trade.cards) : []);
const opportunityForPartner = (o) => {
  const out = clone(o);
  if (out.trade && out.trade.submitted !== true) out.trade = { ...out.trade, cards: [] };
  return ownReadPosition(out, "tp");
};

/* ------------------------------------------------ A COPY SEEN BY A NON-OWNER
   Copy status derives from every Opportunity (contract §4, §6), but a deal's
   state belongs to its participants. A copy that is not the actor's own is
   shown with a status that derives ONLY from the actor's own deals:

     own deal holds or consumed it   -> that status (reserved, committed, traded, sold)
     free, and in the actor's supply -> "available"
     otherwise, named by the actor's
       own deal                      -> "unavailable" (not selectable; no reason)
     otherwise                       -> not projected

   "Otherwise" covers a copy some OTHER deal holds or consumed, a copy outside
   the current Relationship, and an archived copy alike, so a projection reads
   the same whether another partner's deal on a copy is reserved, committed or
   completed — and the same as if the owner had simply removed it. The owner of
   a copy takes part in every deal that holds it, so owners keep full status. */
const UNAVAILABLE = "unavailable";
function copyForViewer(row, { own, world, inSupply, referenced }) {
  if (own !== "available") return { ...row, status: own };
  if (world === "available" && inSupply) return { ...row, status: "available" };
  if (referenced) return { ...row, status: UNAVAILABLE };
  return null;
}

/* ---------------------------------------------------------- COUNTERPARTIES
   Bare identity for the other party of records the actor takes part in, when
   that party is NOT in the actor's network. Related parties are already in the
   network collection with their full allowed profile, so the two never overlap.
   Nothing in `counterparties` is network membership or supply. */
const counterpartiesFrom = (rows, key, isNetwork, records, fields) => {
  const named = new Set();
  rows.forEach((r) => { if (r[key] != null && !isNetwork(r[key])) named.add(r[key]); });
  return records.filter((x) => named.has(x.id)).map((x) => pick(x, fields));
};

/* ------------------------------------------------------------- THE EMPTY VIEW */
const COLLECTIONS = ["catalog", "collectors", "partners", "relationships", "invitations",
  "goals", "preferences", "inventory", "collectorCopies", "binders", "binderEntries",
  "interests", "opportunities", "conversations", "activity", "photoRequests", "copyReviews"];
const SECTIONS = ["actor", ...COLLECTIONS, "counterparties", "discoveries"];
const empty = () => {
  const out = { actor: null };
  for (const k of COLLECTIONS) out[k] = [];
  out.counterparties = [];
  out.discoveries = [];
  return out;
};

/* ------------------------------------------------------- OPPORTUNITY DISCOVERY
   The second projection-only section, and the first derived one.

   `counterparties` names people a record already named; this names an OVERLAP
   between two records the seat already holds — one Collector Goal and one
   Trusted Partner Copy, naming the same exact canonical card, between two
   people with an accepted relationship. It is computed from the finished
   projection rather than from canonical state, which is why there is no second
   visibility rule to state: a derivation over what a seat may see cannot reach
   what it may not. Nothing about it is stored; see metyet-discovery.js for why
   that is the point rather than an economy. */
const withDiscoveries = (view) => ({ ...view, discoveries: discoveriesIn(view) });

/* ============================================================== COLLECTOR */
function projectForCollector(state, me) {
  const cid = me.collectorId;
  const related = (pid) => isRelated(state, pid, cid);
  const allOpps = list(state.opportunities);

  const opportunities = allOpps.filter((o) => o.collectorId === cid);
  const conversations = list(state.conversations).filter((t) => t.collectorId === cid);
  const invitations = list(state.invitations).filter((i) => i.collectorId === cid);
  const photoRequests = list(state.photoRequests).filter((r) => r.collectorId === cid);
  const copyReviews = list(state.copyReviews).filter((r) => r.collectorId === cid);
  const collectorCopies = list(state.collectorCopies).filter((b) => b.collectorId === cid);
  const myCopyIds = new Set(collectorCopies.map((b) => b.id));
  const myBinders = list(state.binders).filter((b) => b.collectorId === cid);
  const myBinderIds = new Set(myBinders.map((b) => b.id));

  /* Inventory: the current supply of Trusted Partners, and the exact copies this
     collector's own deals name — each with a status from their own deals only.
     A photo request or Review Card names a copy but adds none: it shows only
     while the copy is otherwise visible. */
  const referencedInv = new Set(opportunities.map((o) => o.invId).filter((x) => x != null));
  const inventory = list(state.inventory)
    .map((i) => copyForViewer(pick(i, INVENTORY_FOR_COLLECTOR), {
      own: D.inventoryCopyStatus(i.invId, opportunities),
      world: D.inventoryCopyStatus(i.invId, allOpps),
      inSupply: related(i.partnerId) && !i.archived,
      referenced: referencedInv.has(i.invId),
    }))
    .filter(Boolean);

  return {
    actor: { seat: "collector", collectorId: cid },
    catalog: clone(list(state.catalog)),
    collectors: list(state.collectors).filter((c) => c.id === cid)
      .map((c) => omit(c, COLLECTOR_PARTNER_AUTHORED)),
    partners: list(state.partners).filter((p) => related(p.id))        // Trusted Partners
      .map((p) => pick(p, PARTNER_FOR_COLLECTOR)),
    relationships: list(state.relationships).filter((r) => r.collectorId === cid)
      .map((r) => pick(r, RELATIONSHIP_SHARED)),
    invitations: invitations.map((i) => pick(i, INVITATION_FOR_INVITEE)),
    goals: clone(list(state.goals).filter((g) => g.collectorId === cid)),
    preferences: clone(list(state.preferences).filter((p) => p.collectorId === cid)),
    inventory,
    /* The Collector's own cards, whole: every field including `market` and
       `offered`, and every copy whether offered or not. Owning is the fact;
       offering is a flag on it, and a Collector who is not offering a card must
       still be able to see that they own it. */
    collectorCopies: collectorCopies.map((b) => ({ ...clone(b), status: D.collectorCopyStatus(b.id, allOpps) })),
    /* WHERE THEIR CARDS BELONG — theirs, and nobody else's (Phase 5 C3.1).
       Whole, because it is their own organisation and there is nothing in it
       they should be kept from. The entries are scoped through the binders:
       membership is only meaningful inside a binder, so a binder they do not
       own cannot bring its cards into view. */
    binders: clone(myBinders),
    binderEntries: clone(list(state.binderEntries).filter((e) => myBinderIds.has(e.binderId))),
    interests: list(state.interests)
      .filter((x) => myCopyIds.has(x.binderId) && related(x.partnerId))
      .map((x) => pick(x, INTEREST_FOR_COLLECTOR)),
    opportunities: opportunities.map((o) => ownReadPosition(omit(o, OPPORTUNITY_PARTNER_PRIVATE), "collector")),
    conversations: clone(conversations),
    activity: [],                                          // D-4: partner-private
    photoRequests: clone(photoRequests),
    copyReviews: clone(copyReviews),
    counterparties: counterpartiesFrom(
      [...opportunities, ...conversations, ...invitations, ...photoRequests, ...copyReviews],
      "partnerId", related, list(state.partners), PARTNER_IDENTITY),
  };
}

/* ================================================================ PARTNER */
function projectForPartner(state, me) {
  const pid = me.partnerId;
  const inNetwork = (cid) => isRelated(state, pid, cid);
  const allOpps = list(state.opportunities);

  const opportunities = allOpps.filter((o) => o.partnerId === pid);
  const conversations = list(state.conversations).filter((t) => t.partnerId === pid);
  const invitations = list(state.invitations).filter((i) => i.partnerId === pid);
  const photoRequests = list(state.photoRequests).filter((r) => r.partnerId === pid);

  /* Collector copies: the Collector Network's TRADE SUPPLY, and the exact copies
     this partner's own submitted packages name — each with a status from their
     own deals only. The reference value never crosses
     (COLLECTOR_COPY_FOR_PARTNER).

     SUPPLY IS OFFERED SUPPLY (Phase 5 C2). Before this batch, owning a copy and
     offering it were the same act: a copy existed only because the Collector put
     it up for trade, and "I no longer want to trade this" could only be said by
     deleting the record — which threw away the photographs, the certificate and
     the fact of ownership along with the willingness. A Collector can now own a
     card without offering it, so membership of a partner's supply asks the extra
     question: is this copy OFFERED. An unoffered copy is not supply, and a copy
     that stops being offered leaves supply without its owner losing it.

     A copy a partner has already named in a submitted package still reaches them
     as UNAVAILABLE even once it stops being offered — that is `referenced`, and
     it is the same rule as a copy committed to somebody else's deal. A partner
     who has staked a negotiation on a card is told the card is gone, not shown a
     hole where their own proposal used to be. What they are never given is a
     copy they never named that its owner is not offering: copyForViewer returns
     null for it, and a null is dropped. */
  const referencedCopies = new Set(opportunities.flatMap(submittedRows)
    .map((row) => row.binderId).filter((x) => x != null));
  const collectorCopies = list(state.collectorCopies)
    .map((b) => copyForViewer(pick(b, COLLECTOR_COPY_FOR_PARTNER), {
      own: D.collectorCopyStatus(b.id, opportunities),
      world: D.collectorCopyStatus(b.id, allOpps),
      inSupply: inNetwork(b.collectorId) && b.offered === true,
      referenced: referencedCopies.has(b.id),
    }))
    .filter(Boolean);

  return {
    actor: { seat: "tp", partnerId: pid },
    catalog: clone(list(state.catalog)),
    collectors: list(state.collectors).filter((c) => inNetwork(c.id))   // Collector Network
      .map((c) => pick(c, COLLECTOR_FOR_PARTNER)),
    partners: clone(list(state.partners).filter((p) => p.id === pid)),
    relationships: list(state.relationships).filter((r) => r.partnerId === pid)
      .map((r) => pick(r, [...RELATIONSHIP_SHARED, ...RELATIONSHIP_PARTNER_PRIVATE])),
    invitations: clone(invitations),
    goals: list(state.goals).filter((g) => inNetwork(g.collectorId))
      .map((g) => pick(g, GOAL_FOR_PARTNER)),
    preferences: list(state.preferences).filter((p) => inNetwork(p.collectorId))
      .map((p) => pick(p, PREFERENCE_FOR_PARTNER)),
    inventory: list(state.inventory).filter((i) => i.partnerId === pid)
      .map((i) => ({ ...clone(i), status: D.inventoryCopyStatus(i.invId, allOpps) })),
    collectorCopies,
    /* HOW SOMEBODY ORGANISES THEIR COLLECTION IS NOT A FACT ABOUT A TRADE
       (Phase 5 C3.1). A Trusted Partner receives no binder name, no binder id,
       no membership, and — just as importantly — no COUNT and no derived hint.
       "This card is in three of their binders" would leak the same thing the
       names would: how much this Collector cares about a card, which is
       negotiating information they never offered.

       Written as an explicit empty rather than an omitted key, so that the
       answer is a statement somebody made rather than a line nobody wrote. It
       is also what keeps a card's presence in a binder from ever being read as
       demand: demand is a Goal, a Goal is projected above, and there is exactly
       one way for a partner to learn that a Collector wants something. */
    binders: [],
    binderEntries: [],
    interests: clone(list(state.interests).filter((x) => x.partnerId === pid)),
    opportunities: opportunities.map(opportunityForPartner),
    conversations: clone(conversations),
    activity: clone(list(state.activity).filter((a) => a.partnerId === pid)),   // D-4
    photoRequests: clone(photoRequests),
    copyReviews: [],                               // a collector's own review workflow
    counterparties: counterpartiesFrom(
      [...opportunities, ...conversations, ...invitations, ...photoRequests],
      "collectorId", inNetwork, list(state.collectors), COLLECTOR_IDENTITY),
  };
}

/* ================================================================ BOUNDARY */
function projectForActor(state, actor) {
  if (!state || typeof state !== "object") return empty();
  const me = resolveActor(state, actor);
  if (!me) return empty();
  return withDiscoveries(me.seat === "tp" ? projectForPartner(state, me) : projectForCollector(state, me));
}

const FIELD_RULES = Object.freeze({
  COLLECTOR_FOR_PARTNER, COLLECTOR_IDENTITY, COLLECTOR_PARTNER_AUTHORED,
  PARTNER_FOR_COLLECTOR, PARTNER_IDENTITY,
  RELATIONSHIP_SHARED, RELATIONSHIP_PARTNER_PRIVATE, INVITATION_FOR_INVITEE,
  GOAL_FOR_PARTNER, PREFERENCE_FOR_PARTNER, INVENTORY_FOR_COLLECTOR,
  COLLECTOR_COPY_FOR_PARTNER, INTEREST_FOR_COLLECTOR, OPPORTUNITY_PARTNER_PRIVATE,
});

module.exports = { projectForActor, FIELD_RULES, PROJECTED_COLLECTIONS: COLLECTIONS,
  PROJECTION_SECTIONS: SECTIONS, UNAVAILABLE };
