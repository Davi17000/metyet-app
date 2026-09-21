/* ============================================================================
   WHAT THE PRODUCT CURRENTLY OFFERS (Phase 5 Batch 8.1)

   The domain holds forty-eight commands. The product offers nine. Until now the
   difference between those two numbers was a fact about the client — the
   nine were the ones `client/commands.js` happened to bind — and a fact about the
   client is not a boundary. Anybody who could send one request could send any
   of the forty-eight.

   Mostly that was harmless, because every command still checks its own seat and
   its own ownership and nothing here changes that. One of them was not.
   `resolveCardIdentity` takes a card description from its caller and writes it
   into the canonical catalogue, and it checks no seat at all. So an ordinary
   Collector could invent a card, create a Goal for it, and have the invention
   appear on their Trusted Partner's screen — which is exactly the thing Batches
   5 through 8 each say cannot happen. A browser cannot mint canonical identity,
   and from here it cannot mint the legacy kind either.

   THIS IS A DOOR, NOT A RULE. It decides nothing about who may act, and it is
   not a second authorization system: after a command is let through, the seat,
   the ownership, the relationship and every field check are still the domain's,
   and the database is still underneath that. All this says is which commands
   the product has shipped a way to use.

   WHY A LIST AND NOT A CONVENTION. A naming rule, a flag on each command, or a
   check for "does the client bind it" would all put the answer somewhere it
   could drift. A list has to be edited on purpose, by whoever ships the feature,
   in the same change that ships it — which is the only moment anybody actually
   knows whether a command is ready for a person to send.

   AND WHY IT IS NOT A DELETION. `resolveCardIdentity` still exists and still
   works: the prototype is built on the legacy catalogue and several test suites
   are its customers. Closing the production door is the correction. Rewriting
   the demo is not, and would be a much larger batch wearing this one's name.

   WHEN A COMMAND JOINS THIS LIST. When the product grows a surface that sends
   it. The negotiation commands — `startOpportunity`, `proposePrice`,
   `acceptPrice` and the rest of the deal lifecycle — are written, tested and
   deliberately absent from this list, because no screen sends them yet. They
   arrive here in the batch that gives them one.
   ========================================================================== */

/* THIS FILE REQUIRES NOTHING, and that is deliberate. It holds names, not
   rules: it cannot evaluate a command, reach a world, or know what a command
   does. A test — not a load-time throw — checks that every name here is a real
   command and that every name the client sends is here, because a typo should
   fail in the suite before it ships rather than in a server at midnight. */

/* Each entry is a command a production surface sends today, with the surface
   that sends it. If nothing in `client/` sends it, it does not belong here. */
const EXPOSED_COMMANDS = Object.freeze([
  "updatePartnerProfile",        // TP → Profile, reached from Inventory
  "revokeCollectorInvitation",   // TP → Collector Network
  "addGoal",                     // Collector → Goals, "Add a card you're looking for"
  "updateGoalTier",              // Collector → Goals, hunting ⇄ keeping an eye out
  "removeGoal",                  // Collector → Goals, "No longer looking"
  "addInventoryCopy",            // TP → Inventory, "Add a copy"
  /* A COLLECTOR'S OWN CARDS (Phase 5 C2). Three commands, which is the whole of
     the concept: record that you own a card, say whether you are offering it,
     and say you no longer own it. `updateCollectorCopy` is deliberately NOT
     here — editing a copy's value, certificate or photographs is a surface C2
     does not build, and a command with no surface is not shipped. It is written
     and tested; it joins this list in the batch that gives it a screen. */
  "addCollectorCopy",            // Collector → Your Cards, "I own this card"
  "setCollectorCopyOffered",     // Collector → Your Cards, offering ⇄ not offering
  "removeCollectorCopy",         // Collector → Your Cards, "I no longer own this"
]);

/* ONE ANSWER FOR TWO QUESTIONS, ON PURPOSE. A command that does not exist and a
   command that exists but is not offered are refused identically, so the reply
   cannot be used to read the domain's command table from outside. */
const isExposed = (command) => typeof command === "string"
  && EXPOSED_COMMANDS.includes(command);

module.exports = { EXPOSED_COMMANDS, isExposed };
