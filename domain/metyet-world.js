/* ============================================================================
   CANONICAL WORLD VALIDATION — WHAT PERSISTENCE MUST PRESERVE (Phase 3)

     validateWorld(state)  ->  { ok, errors: [{ code, path, message }] }

   The command layer and the projection read one canonical world. Today it lives
   in memory; later a repository will load it from a database and save what a
   command returns. This is the executable statement of what that round trip
   must keep true: the collections exist, records have their identity, every
   reference points at a record that exists and is owned by the right party,
   and the cross-record invariants the commands maintain still hold.

   Scope, deliberately:
     - pure: no I/O, no mutation, no clock, no randomness; the same state gives
       the same result;
     - only rules the domain already establishes — the commands enforce them
       when records are created or changed, or execute/projection depend on
       them. No UI rule, no database rule, no new product rule;
     - history stays valid: a completed or ended Opportunity may keep a Goal id
       its collector has since removed, a copy may be archived, a Relationship
       may have ended. Rules the lifecycle legitimately relaxes are relaxed here;
     - every problem is reported, not just the first, each with a stable code,
       the path of the offending value and a sentence naming the record ids, so
       a failed load or migration says exactly what to fix.

   It does not judge economics (prices, balances, turn order): the domain derives
   those from the negotiation threads themselves.

   NOT ASSERTED, deliberately: that a BinderCopy is held by one deal at a time.
   proposeTradeSelection refuses a copy another live deal has reserved or
   committed, so commands never create a double hold; but the prototype's demo
   seed assigns one collector copy per card identity to several deals, live and
   completed, and seed-integrity.cjs accepts that ("two different deals may
   legitimately settle the same copy"). Asserting it here would reject the
   established demo world. Revisit when the demo seed is separated from product
   state (Phase 3 Architecture Recommendation, Batch 7).
   ========================================================================== */

const D = require("./metyet-domain.js");

/* Collections the in-process store always materialises, so a persisted world
   must too. `preferences` and `activity` may be absent (the product seed has no
   preference rows; a world may have no activity yet) but are lists when present.

   `catalog` BECAME OPTIONAL IN PHASE 5 BATCH 5, and the reason is the whole of
   that batch. A card catalog is a reference work, not a record of what happened:
   it is true whether or not anybody has ever wanted a card, it changes when a
   set is released rather than when a person acts, and no command writes it.
   Holding it here meant loading eighteen thousand printings under the world
   lock on every command and shipping all of them to every client on every view.
   It now lives in its own schema, read without the lock and without this
   function — see the catalog migration and its repository.

   The in-process demo still carries one, because the demo IS its own catalog:
   it has no server to ask, and its picker searches the collection directly. So
   a world may have a catalog and is checked against it when it does. A
   production world has none, and the references that would have been checked
   here are held by a database foreign key to a canonical card instead — which
   is a stronger guarantee than this one, not a weaker one, because it cannot be
   bypassed by a caller that forgets to validate. */
/* `binder` became `collectorCopies` in C2. It was never a binder: it is a
   Collector's own physical card, the mirror image of a Trusted Partner's
   `inventory`. The word is now reserved for the named organisational grouping
   C3 will add, whose membership points at a canonical card. */
const REQUIRED_COLLECTIONS = ["collectors", "partners", "relationships", "invitations",
  "goals", "inventory", "collectorCopies", "interests", "opportunities", "conversations",
  "photoRequests", "copyReviews"];
const OPTIONAL_COLLECTIONS = ["catalog", "preferences", "activity"];

/* The stages an Opportunity occupies: D.STAGES without the two intent stages,
   which describe Goals. */
const OPPORTUNITY_STAGES = D.STAGES.filter((s) => s.group !== "intent").map((s) => s.id);
const GOAL_TIERS = ["primary", "secondary"];
const SEATS = ["tp", "collector"];

const list = (xs) => (Array.isArray(xs) ? xs : []);
const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v) => typeof v === "string" && v.length > 0;
const blank = (v) => v === undefined || v === null;
/* The command layer's money rule (addInventoryCopy, updateInventoryCopy): blank,
   or a finite amount of at least zero. */
const validMoney = (v) => blank(v) || (isFinite(Number(v)) && Number(v) >= 0);
const isCurrent = (r) => r.status == null || r.status === "accepted";

function validateWorld(state) {
  const errors = [];
  const report = (code, path, message) => { errors.push({ code, path, message }); };

  if (!isObject(state)) {
    report("world.not-object", "", "The world must be a plain object of collections.");
    return { ok: false, errors };
  }

  /* ---------------------------------------------------------- COLLECTIONS */
  for (const k of REQUIRED_COLLECTIONS) {
    if (state[k] === undefined) report("collection.missing", k, `Collection "${k}" is missing.`);
    else if (!Array.isArray(state[k])) report("collection.not-array", k, `Collection "${k}" must be an array.`);
  }
  for (const k of OPTIONAL_COLLECTIONS) {
    if (state[k] !== undefined && !Array.isArray(state[k])) {
      report("collection.not-array", k, `Collection "${k}" must be an array when present.`);
    }
  }

  /* The object records of each collection, with their paths. A record that is
     not an object is reported once and skipped by every later rule. */
  const C = {};
  for (const name of [...REQUIRED_COLLECTIONS, ...OPTIONAL_COLLECTIONS]) {
    C[name] = [];
    list(state[name]).forEach((r, i) => {
      if (isObject(r)) C[name].push([r, `${name}[${i}]`]);
      else report("record.not-object", `${name}[${i}]`, `${name}[${i}] must be an object.`);
    });
  }

  /* Index a collection by its id field, reporting missing and duplicate ids. */
  const index = (name, key = "id") => {
    const map = new Map();
    for (const [r, path] of C[name]) {
      const id = r[key];
      if (!isId(id)) report("id.missing", `${path}.${key}`, `${path} has no ${key}.`);
      else if (map.has(id)) report("id.duplicate", `${path}.${key}`, `${name} id "${id}" is used more than once.`);
      else map.set(id, r);
    }
    return map;
  };
  const catalog = index("catalog");
  const collectors = index("collectors");
  const partners = index("partners");
  const goals = index("goals");
  const inventory = index("inventory", "invId");
  const collectorCopies = index("collectorCopies");
  const opportunities = index("opportunities");
  index("invitations");
  index("conversations");
  index("activity");
  index("photoRequests");
  index("copyReviews");

  /* A reference that must resolve. Returns the target, or null. */
  const ref = (map, id, path, what, owner) => {
    if (!isId(id)) { report("ref.missing", path, `${owner} names no ${what}.`); return null; }
    const hit = map.get(id);
    if (!hit) report("ref.unknown", path, `${owner} names ${what} "${id}", which does not exist.`);
    return hit || null;
  };
  const ownerMismatch = (path, message) => report("ref.owner-mismatch", path, message);

  /* A CARD REFERENCE, CHECKED AGAINST THE WORLD'S OWN CATALOG WHEN IT HAS ONE.

     A world that carries a catalog is answerable for its card references, and
     nothing about that changed. A world that carries none is not describing a
     missing card — it is a production world, whose card references name rows in
     a catalog this function cannot see and a foreign key already enforces.
     Reporting them here would make every production world invalid for naming
     cards that exist.

     Returns null when there is nothing to check against, which every caller
     already handles: a null card simply skips the identity and thread-key rules
     that would have used it. */
  const hasCatalog = Array.isArray(state.catalog);
  const cardRef = (id, path, owner) => (hasCatalog ? ref(catalog, id, path, "card", owner) : null);

  /* ---------------------------------------------------------- PARTIES */
  for (const [r, path] of C.catalog) {
    if (typeof r.name !== "string" || !r.name) report("field.invalid", `${path}.name`, `Card "${r.id}" has no name.`);
  }

  /* One current Relationship per partner and collector: it is the home of that
     partner's private metadata about the collector (D-1). */
  const pairs = new Set();
  for (const [r, path] of C.relationships) {
    const who = `Relationship ${r.partnerId} / ${r.collectorId}`;
    ref(partners, r.partnerId, `${path}.partnerId`, "partner", who);
    ref(collectors, r.collectorId, `${path}.collectorId`, "collector", who);
    if (isCurrent(r)) {
      const key = `${r.partnerId}|${r.collectorId}`;
      if (pairs.has(key)) report("invariant.one-relationship-per-pair", path, `${who} is recorded more than once.`);
      pairs.add(key);
    }
  }
  /* AN INVITATION MAY NAME NOBODY (Phase 5 Batch 2). It is created before
     anyone has joined, so `collectorId` is null until a redemption resolves
     one — and a world where it is null is correct, not incomplete. What must
     still hold: an invitation that DOES name a collector names one that exists,
     and an invitation that was accepted names the collector the acceptance
     produced. The second is what stops an accepted invitation from pointing at
     nobody, which is the state Batch 3 must never be able to leave behind. */
  for (const [r, path] of C.invitations) {
    ref(partners, r.partnerId, `${path}.partnerId`, "partner", `Invitation "${r.id}"`);
    if (isId(r.collectorId)) {
      ref(collectors, r.collectorId, `${path}.collectorId`, "collector", `Invitation "${r.id}"`);
    } else if (r.acceptedAt) {
      report("ref.missing", `${path}.collectorId`,
        `Invitation "${r.id}" was accepted but names no collector.`);
    }
  }
  for (const [r, path] of C.preferences) {
    ref(collectors, r.collectorId, `${path}.collectorId`, "collector", `Preference row ${path}`);
  }

  /* ---------------------------------------------------------- GOALS AND COPIES */
  for (const [g, path] of C.goals) {
    const who = `Goal "${g.id}"`;
    ref(collectors, g.collectorId, `${path}.collectorId`, "collector", who);
    /* A GOAL NAMES ITS CARD ONE WAY OR THE OTHER (Phase 5 Batch 7), on the same
       rule an InventoryCopy has followed since Batch 6: `canonicalCardId` is an
       opaque id in the catalog schema held by a foreign key this function
       cannot see, `cardId` is the demo's own catalogue row, and exactly one of
       them is a Goal. Wanting nothing is not demand, and wanting two things at
       once is not one Goal. */
    const canonical = isId(g.canonicalCardId);
    const legacy = isId(g.cardId);
    if (canonical && legacy) {
      report("ref.ambiguous", `${path}.canonicalCardId`,
        `${who} names both a canonical card and a catalogue card; a Goal is for one card.`);
    } else if (!canonical && !legacy) {
      report("ref.missing", `${path}.cardId`, `${who} names no card.`);
    } else if (legacy) {
      cardRef(g.cardId, `${path}.cardId`, who);
    }
    if (!GOAL_TIERS.includes(g.tier)) {
      report("field.invalid", `${path}.tier`, `${who} has tier ${JSON.stringify(g.tier)}; expected "primary" or "secondary".`);
    }
  }
  for (const [i, path] of C.inventory) {
    const who = `InventoryCopy "${i.invId}"`;
    ref(partners, i.partnerId, `${path}.partnerId`, "partner", who);
    /* A COPY NAMES ITS CARD ONE WAY OR THE OTHER (Phase 5 Batch 6).

       `canonicalCardId` is the way from now on: an opaque id in the catalog
       schema, held by a database foreign key that this function cannot see and
       does not need to. `cardId` is the demo's way, and is still checked
       against the world's own catalog exactly as it always was.

       EXACTLY ONE, because two would be two answers to "which card is this?"
       and nothing decides between them. Neither is a copy of nothing. */
    const canonical = isId(i.canonicalCardId);
    const legacy = isId(i.cardId);
    if (canonical && legacy) {
      report("ref.ambiguous", `${path}.canonicalCardId`,
        `${who} names both a canonical card and a catalogue card; a copy is of one card.`);
    } else if (!canonical && !legacy) {
      report("ref.missing", `${path}.cardId`, `${who} names no card.`);
    } else if (legacy) {
      cardRef(i.cardId, `${path}.cardId`, who);
    }
    for (const k of ["ask", "cost"]) {
      if (!validMoney(i[k])) report("field.invalid", `${path}.${k}`, `${who} has an invalid ${k}.`);
    }
    if (!blank(i.archived) && typeof i.archived !== "boolean") {
      report("field.invalid", `${path}.archived`, `${who}.archived must be true or false.`);
    }
  }
  for (const [b, path] of C.collectorCopies) {
    const who = `CollectorCopy "${b.id}"`;
    ref(collectors, b.collectorId, `${path}.collectorId`, "collector", who);
    /* A COPY NAMES ITS CARD ONE WAY OR THE OTHER (Phase 5 C2), on the rule an
       InventoryCopy has followed since Batch 6. Owning nothing is not owning,
       and owning two cards at once is two copies. */
    const canonical = isId(b.canonicalCardId);
    const legacy = isId(b.cardId);
    if (canonical && legacy) {
      report("ref.ambiguous", `${path}.canonicalCardId`,
        `${who} names both a canonical card and a catalogue card; a copy is of one card.`);
    } else if (!canonical && !legacy) {
      report("ref.missing", `${path}.cardId`, `${who} names no card.`);
    } else if (legacy) {
      cardRef(b.cardId, `${path}.cardId`, who);
    }
    /* OWNING AND OFFERING ARE DIFFERENT FACTS (C2). `offered` is the owner's
       willingness; the deal status beside it is derived from the
       opportunities and is never stored. A copy that says neither true nor
       false about offering says nothing, which is not a state. */
    if (!blank(b.offered) && typeof b.offered !== "boolean") {
      report("field.invalid", `${path}.offered`, `${who} has a non-boolean "offered".`);
    }
    if (b.grade && !D.GRADED_VALUES.includes(b.grade)) {
      report("field.invalid", `${path}.grade`, `${who} has a grade the product has no word for.`);
    }
    if (b.condition && !D.CONDITION_VALUES.includes(b.condition)) {
      report("field.invalid", `${path}.condition`, `${who} has a condition the product has no word for.`);
    }
    if (!blank(b.market) && !(Number(b.market) >= 0)) {
      report("field.invalid", `${path}.market`, `${who} has an invalid reference value.`);
    }
  }
  for (const [x, path] of C.interests) {
    const who = `Interest of "${x.partnerId}" in "${x.binderId}"`;
    ref(partners, x.partnerId, `${path}.partnerId`, "partner", who);
    ref(collectorCopies, x.binderId, `${path}.binderId`, "collector copy", who);
  }
  /* A photo request or Review Card is about one partner's exact copy. */
  for (const name of ["photoRequests", "copyReviews"]) {
    for (const [r, path] of C[name]) {
      const who = `${name === "photoRequests" ? "Photo request" : "Review Card"} "${r.id}"`;
      ref(collectors, r.collectorId, `${path}.collectorId`, "collector", who);
      ref(partners, r.partnerId, `${path}.partnerId`, "partner", who);
      const copy = ref(inventory, r.invId, `${path}.invId`, "inventory copy", who);
      if (copy && copy.partnerId !== r.partnerId) {
        ownerMismatch(`${path}.partnerId`, `${who} names partner "${r.partnerId}", but copy "${r.invId}" belongs to "${copy.partnerId}".`);
      }
    }
  }
  for (const [x, path] of C.activity) {
    const who = `Activity "${x.id}"`;
    ref(collectors, x.collectorId, `${path}.collectorId`, "collector", who);
    /* A row with no owner is legacy: projected to nobody (D-4), not corrupt. */
    if (!blank(x.partnerId)) ref(partners, x.partnerId, `${path}.partnerId`, "partner", who);
  }

  /* ---------------------------------------------------------- OPPORTUNITIES */
  const holders = { goal: new Map(), committed: new Map(), sold: new Map() };
  const hold = (map, key, oppId) => map.set(key, [...(map.get(key) || []), oppId]);

  for (const [o, path] of C.opportunities) {
    const who = `Opportunity "${o.id}"`;
    ref(collectors, o.collectorId, `${path}.collectorId`, "collector", who);
    ref(partners, o.partnerId, `${path}.partnerId`, "partner", who);
    /* AN OPPORTUNITY NAMES ITS CARD ONE WAY OR THE OTHER (Phase 5 Batch 8), on
       the rule a Copy has followed since Batch 6 and a Goal since Batch 7. A
       deal over no card is not a deal, and a deal over two cards is two deals.
       History is included: an Opportunity that has completed still names the
       card it was about, and always did. */
    const canonicalCard = isId(o.canonicalCardId);
    const legacyCard = isId(o.cardId);
    if (canonicalCard && legacyCard) {
      report("ref.ambiguous", `${path}.canonicalCardId`,
        `${who} names both a canonical card and a catalogue card; a deal is over one card.`);
    } else if (!canonicalCard && !legacyCard) {
      report("ref.missing", `${path}.cardId`, `${who} names no card.`);
    }
    const card = legacyCard ? cardRef(o.cardId, `${path}.cardId`, who) : null;
    if (!OPPORTUNITY_STAGES.includes(o.stage)) {
      report("field.invalid", `${path}.stage`, `${who} has stage ${JSON.stringify(o.stage)}; expected one of ${OPPORTUNITY_STAGES.join(", ")}.`);
    }
    const active = D.isActive(o);

    /* GOAL. A live negotiation is for one of its collector's Goals, which stays
       locked while it runs (removeGoal refuses). History may outlive the Goal. */
    const goal = isId(o.goalId) ? goals.get(o.goalId) : null;
    if (active && !isId(o.goalId)) report("ref.missing", `${path}.goalId`, `${who} is active but names no Goal.`);
    else if (active && !goal) report("ref.unknown", `${path}.goalId`, `${who} is active but its Goal "${o.goalId}" does not exist.`);
    if (goal && goal.collectorId !== o.collectorId) {
      ownerMismatch(`${path}.goalId`, `${who} belongs to collector "${o.collectorId}", but Goal "${o.goalId}" belongs to "${goal.collectorId}".`);
    }
    if (active && isId(o.goalId)) hold(holders.goal, o.goalId, o.id);

    /* EXACT INVENTORY COPY, when bound: the partner's own copy of this card.
       Copies are archived, never deleted, so the reference outlives the deal. */
    if (!blank(o.invId)) {
      const copy = ref(inventory, o.invId, `${path}.invId`, "inventory copy", who);
      if (copy && copy.partnerId !== o.partnerId) {
        ownerMismatch(`${path}.invId`, `${who} is with partner "${o.partnerId}", but copy "${o.invId}" belongs to "${copy.partnerId}".`);
      }
      const copyCard = copy ? catalog.get(copy.cardId) : null;
      if (copyCard && card && !D.sameIdentity(copyCard, card)) {
        report("ref.identity-mismatch", `${path}.invId`, `${who} is for card "${o.cardId}", but copy "${o.invId}" is a different card identity.`);
      }
      /* THE SAME QUESTION ON CANONICAL IDENTITY (Phase 5 Batch 8), which is an
         equality on an opaque id rather than a comparison of dimensions. A deal
         that names a canonical card is over a copy that names the SAME one, and
         a copy that names its card the other way has not been compared — the
         two vocabularies never meet, here or in startOpportunity. */
      if (canonicalCard && copy && isId(copy.canonicalCardId)
        && copy.canonicalCardId !== o.canonicalCardId) {
        report("ref.identity-mismatch", `${path}.invId`,
          `${who} is for canonical card "${o.canonicalCardId}", but copy "${o.invId}" is a different canonical card.`);
      }
      if (canonicalCard && copy && !isId(copy.canonicalCardId)) {
        report("ref.identity-mismatch", `${path}.invId`,
          `${who} names a canonical card, but copy "${o.invId}" names a catalogue card; the two are not comparable.`);
      }
      if (active && o.agreedPrice != null) hold(holders.committed, o.invId, o.id);
      if (D.isCompleted(o)) hold(holders.sold, o.invId, o.id);
    }

    /* TRADE PACKAGE: rows naming the collector's own BinderCopies. */
    if (!blank(o.trade) && !isObject(o.trade)) report("field.invalid", `${path}.trade`, `${who}.trade must be an object or null.`);
    const cards = isObject(o.trade) ? o.trade.cards : undefined;
    if (!blank(cards) && !Array.isArray(cards)) report("field.invalid", `${path}.trade.cards`, `${who}.trade.cards must be an array.`);
    const rowIds = new Set();
    list(cards).forEach((row, j) => {
      const rp = `${path}.trade.cards[${j}]`;
      if (!isObject(row)) { report("record.not-object", rp, `${rp} must be an object.`); return; }
      const rowWho = `Trade row "${row.id}" of ${who}`;
      if (!isId(row.id)) report("id.missing", `${rp}.id`, `A trade row of ${who} has no id.`);
      else if (rowIds.has(row.id)) report("id.duplicate", `${rp}.id`, `${rowWho} appears twice.`);
      else rowIds.add(row.id);
      /* EXACTLY ONE CARD REFERENCE (C2), the same rule inventory, goals,
         opportunities and collector copies each carry: a row names its card
         canonically or legacily, never both and never neither. */
      const rowCanonical = isId(row.canonicalCardId);
      const rowLegacy = isId(row.cardId);
      if (rowCanonical && rowLegacy) {
        report("ref.ambiguous", `${rp}.canonicalCardId`,
          `${rowWho} names both a canonical card and a legacy card.`);
      } else if (!rowCanonical && !rowLegacy) {
        report("ref.missing", `${rp}.cardId`, `${rowWho} names no card.`);
      } else if (rowLegacy) {
        cardRef(row.cardId, `${rp}.cardId`, rowWho);
      }
      if (blank(row.binderId)) return;
      const b = ref(collectorCopies, row.binderId, `${rp}.binderId`, "collector copy", rowWho);
      if (b && b.collectorId !== o.collectorId) {
        ownerMismatch(`${rp}.binderId`, `${rowWho} offers collector copy "${row.binderId}", which belongs to "${b.collectorId}", not "${o.collectorId}".`);
      }
      /* And the row must name the card its copy names. A package that pointed at
         one card while carrying a copy of another would let a Collector be paid
         for something they are not handing over. */
      if (b) {
        const same = rowCanonical
          ? b.canonicalCardId === row.canonicalCardId
          : b.cardId === row.cardId;
        if (!same) {
          report("ref.mismatch", `${rp}.binderId`,
            `${rowWho} names a different card from collector copy "${row.binderId}".`);
        }
      }
    });

    if (!blank(o.priceThread) && !Array.isArray(o.priceThread)) {
      report("field.invalid", `${path}.priceThread`, `${who}.priceThread must be an array.`);
    }
    /* READING POSITIONS: one per seat, and nothing else (projected per seat). */
    if (!blank(o.viewedAt)) {
      if (!isObject(o.viewedAt)) report("field.invalid", `${path}.viewedAt`, `${who}.viewedAt must be an object.`);
      else {
        for (const k of Object.keys(o.viewedAt)) {
          if (!SEATS.includes(k)) report("field.invalid", `${path}.viewedAt.${k}`, `${who}.viewedAt has an unknown seat "${k}".`);
          else if (!isObject(o.viewedAt[k])) report("field.invalid", `${path}.viewedAt.${k}`, `${who}.viewedAt.${k} must be an object.`);
        }
      }
    }
  }

  /* Cross-record invariants the commands maintain. */
  const once = (map, code, say) => {
    for (const [key, ids] of map) if (ids.length > 1) report(code, "opportunities", say(key, ids));
  };
  once(holders.goal, "invariant.one-negotiation-per-goal",
    (g, ids) => `Goal "${g}" has ${ids.length} active opportunities (${ids.join(", ")}); a Goal is negotiated once at a time.`);
  once(holders.committed, "invariant.copy-committed-once",
    (i, ids) => `InventoryCopy "${i}" is committed to ${ids.length} active opportunities (${ids.join(", ")}).`);
  once(holders.sold, "invariant.copy-sold-once",
    (i, ids) => `InventoryCopy "${i}" was sold by ${ids.length} completed opportunities (${ids.join(", ")}).`);

  /* ---------------------------------------------------------- CONVERSATIONS */
  const threadKeys = new Set();
  for (const [t, path] of C.conversations) {
    const who = `Conversation "${t.id}"`;
    ref(collectors, t.collectorId, `${path}.collectorId`, "collector", who);
    /* D.threadKey throws on a partnerless thread, so this one breaks execute. */
    ref(partners, t.partnerId, `${path}.partnerId`, "partner", who);
    const card = cardRef(t.cardId, `${path}.cardId`, who);
    if (card && isId(t.collectorId) && isId(t.partnerId)) {
      const expected = D.threadKey(t.collectorId, t.partnerId, card);
      if (t.key !== expected) {
        report("field.invalid", `${path}.key`, `${who} has key ${JSON.stringify(t.key)}; its participants and card give "${expected}".`);
      }
    }
    if (isId(t.key)) {
      if (threadKeys.has(t.key)) report("id.duplicate", `${path}.key`, `Conversation key "${t.key}" is used by more than one thread.`);
      threadKeys.add(t.key);
    }
    if (!blank(t.oppId)) {
      const o = ref(opportunities, t.oppId, `${path}.oppId`, "opportunity", who);
      if (o && (o.collectorId !== t.collectorId || o.partnerId !== t.partnerId)) {
        ownerMismatch(`${path}.oppId`, `${who} is linked to "${t.oppId}", which is between different participants.`);
      }
    }
    if (!Array.isArray(t.entries)) {
      report("field.invalid", `${path}.entries`, `${who}.entries must be an array.`);
      continue;
    }
    const entryIds = new Set();
    t.entries.forEach((e, j) => {
      const ep = `${path}.entries[${j}]`;
      if (!isObject(e)) { report("record.not-object", ep, `${ep} must be an object.`); return; }
      if (!isId(e.id)) report("id.missing", `${ep}.id`, `An entry of ${who} has no id.`);
      else if (entryIds.has(e.id)) report("id.duplicate", `${ep}.id`, `Entry "${e.id}" appears twice in ${who}.`);
      else entryIds.add(e.id);
      if (blank(e.at) || e.at === "") report("field.invalid", `${ep}.at`, `Entry "${e.id}" of ${who} has no time.`);
    });
  }

  return { ok: errors.length === 0, errors };
}

module.exports = { validateWorld, REQUIRED_COLLECTIONS, OPTIONAL_COLLECTIONS, OPPORTUNITY_STAGES };
