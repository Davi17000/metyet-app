/* ============================================================================
   OPPORTUNITY DISCOVERY — WHERE SUPPLY AND DEMAND ALREADY OVERLAP (Phase 5 B8)

     discoveriesIn(view)  ->  every (Goal, Trusted Partner) overlap inside `view`

   THE SENTENCE THIS FILE IMPLEMENTS, AND NOTHING WIDER:

     an explicit Collector Goal
     + an available Trusted Partner Copy
     + an accepted relationship between those two people
     + the same exact canonical card
     = something both of them should know

   Every clause is load-bearing. None of them is a heuristic.

   ---------------------------------------------------------------------------
   WHY THIS IS COMPUTED AND NOT STORED.

   There is already an Opportunity record, and it is something else: it is one
   Collector having made one Trusted Partner an offer on one physical copy, with
   a price thread, a stage, a trade package and a handoff plan. A person starts
   it. Writing a row there when two records merely agree about a card would
   fabricate a negotiation nobody opened, and the domain would believe it: a
   Goal with an active Opportunity is locked at Primary and cannot be removed,
   a Copy in one is committed and cannot be offered to anybody else, and a Goal
   may hold one at a time. Discovery would have reserved inventory and frozen
   demand, which is the opposite of what noticing something means.

   So this is a derivation, and it joins a long line of them. Whether a Goal is
   seeking or negotiating, whether a Copy is available, committed or sold,
   whether a Binder copy is reserved or traded, whether a copy has been asked
   about — none of those are stored either, and for the same reason: two answers
   to one question is how a product starts lying to one of the people using it.

   What follows from being derived, at no cost:
     - it is idempotent. Asking twice asks the same question twice. There are no
       duplicates to suppress and no reconciliation to run;
     - it cannot go stale. Archive a copy and the overlap is gone next time
       somebody looks, because it was never written down;
     - it destroys nothing. A Goal removed, a relationship ended, a card
       withdrawn from the catalogue — none of these erase history, because this
       never wrote any. The history lives in the Opportunity, which persists.

   If a later batch needs durable discovery — "you were told about this on the
   fourth" is a real product question — a table can be added then and filled
   from this same function. That direction is open. The other one is not.

   ---------------------------------------------------------------------------
   THE UNIT IS ONE GOAL AND ONE TRUSTED PARTNER.

   Not one Goal and one physical Copy. A Collector's question is "who has this",
   and a partner holding three of them is one person to talk to, not three. The
   exact copies are carried along, because an offer is eventually made on one of
   them and the id has to come from somewhere — but they are carried, not
   multiplied. This is the shape the prototype's own `partnersWith` arrived at,
   which is evidence about the product rather than about this file.

   It follows that nothing here is a reservation. Two Collectors wanting the
   same card both discover the same partner and the same copies; neither
   discovery removes the other, because neither one takes anything.

   ---------------------------------------------------------------------------
   IT READS A PROJECTION, NOT THE WORLD, AND THAT IS THE PRIVACY ARGUMENT.

   The input is one seat's finished projection — the Goals that seat may see,
   the Copies that seat may see, the Relationships that seat is party to. A
   derivation over those cannot name anything the seat was not already given,
   so there is no second privacy rule here to get wrong, and no possibility of
   this reaching past the boundary that has always been the boundary.

   It is also, exactly, one computation read from both ends. A Collector's
   projection holds their own Goals and their Trusted Partners' supply; a
   partner's holds their own supply and their Collector Network's Goals. The
   same cross product over both gives "partners who have what I want" to one
   and "collectors who want what I have" to the other. The relationship is
   re-checked here regardless, so the rule is stated where it is relied on
   rather than inferred from how the projection happens to be built.

   ---------------------------------------------------------------------------
   IDENTITY IS CANONICAL AND EXACT, OR THERE IS NO OVERLAP.

   Both sides must name a canonical card and the two ids must be equal. Nothing
   here looks at a name, an expansion, a collector number, a picture, a provider
   id, a search term, or the legacy identity key. Different printings of one
   card are different canonical cards and do not meet: wanting the 1st Edition
   is not wanting the Unlimited, and the product would be lying to say otherwise.

   A legacy Goal or a legacy Copy — the demo's, naming a catalogue row — takes
   no part at all. Not because it is old, but because a legacy row cannot say
   which printing it means, and a discovery is a claim about an exact card.

   ---------------------------------------------------------------------------
   BOTH TIERS ARE DEMAND, AND THE TIER IS CARRIED, NEVER JUDGED.

   Primary is actively hunting; Secondary is keeping an eye out. Both are a
   person having said, explicitly, that they want one exact card — which is why
   both are projected to the partner, both are counted on a partner's profile,
   and both are worded for the partner by name. Only the OFFER is Primary-only,
   and that rule lives where offers are made.

   The tier travels verbatim. Nothing here promotes, demotes, scores, ranks by
   urgency, or invents a third kind of wanting.
   ========================================================================== */

const list = (xs) => (Array.isArray(xs) ? xs : []);
const isId = (v) => typeof v === "string" && v.length > 0;

/* THE RELATIONSHIP, ON THE SAME TERMS THE COMMAND LAYER USES. A row with no
   status is one of the prototype's, from before the field existed, and has
   always counted as current; anything else must say "accepted". An invitation
   is not a relationship and is not in this collection. */
const accepted = (relationships, partnerId, collectorId) => list(relationships)
  .some((r) => r.partnerId === partnerId && r.collectorId === collectorId
    && (r.status == null || r.status === "accepted"));

/* CURRENT SUPPLY, on Batch 6's existing lifecycle and not a new one. A copy is
   supply when its owner still has it on the shelf (`archived` is how a copy is
   removed; rows are never deleted) and when no deal has taken it — `status`
   arrives on the projected row already derived from the opportunities, and is
   "committed" once a price is settled and "sold" once a deal completes. Both of
   those are copies `startOpportunity` would refuse, so neither is offered here
   as though it could be bought. Nothing about grade or condition is consulted:
   those are facts about the copy, not about whether it exists to be had. */
const AVAILABLE = "available";
const isSupply = (copy) => !!copy && copy.archived !== true
  && copy.status === AVAILABLE && isId(copy.canonicalCardId) && isId(copy.partnerId)
  && isId(copy.invId);

/* EXPLICIT DEMAND. A Goal, with an owner and an exact card. Nothing else in a
   projection is demand: not a preference tag, not a browsed card context, not a
   conversation, not a photo request, not a Binder copy. */
const isDemand = (goal) => !!goal && isId(goal.id) && isId(goal.collectorId)
  && isId(goal.canonicalCardId);

/* One Goal, one partner. Stable, derived from the two ids and nothing else, so
   the same overlap has the same key every time it is computed and no two
   overlaps can collide. */
const discoveryKey = (goalId, partnerId) => goalId + "::" + partnerId;

function discoveriesIn(view) {
  if (!view || typeof view !== "object") return [];
  const goals = list(view.goals).filter(isDemand);
  if (goals.length === 0) return [];
  const supply = list(view.inventory).filter(isSupply);
  if (supply.length === 0) return [];

  /* Supply indexed by the exact card, so the join below is an equality on an
     opaque id and could not be anything looser if it tried. */
  const byCard = new Map();
  for (const copy of supply) {
    const held = byCard.get(copy.canonicalCardId);
    if (held) held.push(copy);
    else byCard.set(copy.canonicalCardId, [copy]);
  }

  const found = new Map();
  for (const goal of goals) {
    const copies = byCard.get(goal.canonicalCardId);
    if (!copies) continue;
    for (const copy of copies) {
      if (!accepted(view.relationships, copy.partnerId, goal.collectorId)) continue;
      const key = discoveryKey(goal.id, copy.partnerId);
      const held = found.get(key);
      if (held) { held.invIds.push(copy.invId); continue; }
      found.set(key, {
        key,
        goalId: goal.id,
        collectorId: goal.collectorId,
        partnerId: copy.partnerId,
        canonicalCardId: goal.canonicalCardId,
        tier: goal.tier,
        invIds: [copy.invId],
      });
    }
  }

  /* Ordered by the key, which is ordered by nothing anybody could read as a
     ranking. There is no score here to sort by and there is not going to be
     one; a surface that wants recency or price sorts by a fact it already
     holds. Copy ids are sorted for the same reason: so two evaluations of one
     unchanged world are identical, byte for byte. */
  return [...found.values()]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((d) => ({ ...d, invIds: [...d.invIds].sort(), copies: d.invIds.length }));
}

module.exports = { discoveriesIn, discoveryKey };
