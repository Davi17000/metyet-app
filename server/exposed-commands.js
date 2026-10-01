/* ============================================================================
   WHAT THE PRODUCT CURRENTLY OFFERS (Phase 5 Batch 8.1)

   THE DOMAIN HOLDS MANY MORE COMMANDS THAN THE PRODUCT OFFERS, and the exact
   two numbers are the list below and `COMMAND_NAMES` — not this paragraph. It
   said "forty-nine" and "eighteen" for three batches after both had moved,
   which is the third time a hand-written count in this file has gone stale, so
   it no longer carries one. The tests assert the real totals; a sentence cannot.

   Until this file existed the difference between those two numbers was a fact
   about the client — the offered ones were whatever `client/commands.js` happened to bind
   — and a fact about the client is not a boundary. Anybody who could send one
   request could send any of them.

   (Batch 8.1 wrote "forty-eight" and "nine", which were the numbers that day.
   They drifted as batches shipped, and a header nobody can trust is worse than
   one that is merely old, so C5 corrected them. The list below is the answer;
   these two sentences are only the summary.)

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
  /* AND WHETHER THEY ARE KEEPING IT (the four-state batch). PC is the other
     half of a copy's disposition, and it needed a door of its own for the same
     reason offering did: it is a decision with consequences for who can see the
     card, not a correctable typo, so it does not travel inside a patch. The two
     commands clear each other in the domain, which is what makes "both at once"
     unreachable rather than merely discouraged. It states nothing about a card,
     changes no Goal, creates no Binder membership, and never crosses to a
     Trusted Partner — a kept copy is not offered, so the row does not reach
     them at all. */
  "setCollectorCopyKept",
  "removeCollectorCopy",         // Collector → Your Cards, "I no longer own this"
  /* THE CARD SPECIFICATION SURFACE (Phase 5 C3.3). Five, and each one is a
     control on the panel a Collector opens from Browse — which is the rule this
     list has always had: a command joins in the batch that ships a way to send
     it, not in the batch that writes it.

     `updateCollectorCopy` is the oldest debt here. C2 wrote it, tested it, and
     deliberately left it closed with a note saying it would join "in the batch
     that gives it a screen". This is that batch: the panel shows a copy's
     grade, condition, certificate and reference value, and a screen that shows
     them while refusing to change them would be a worse answer than not showing
     them at all. It is also how a copy written before C3.2 — one that says both
     PSA 9 and Damaged — gets corrected, which §13 of this batch requires and no
     other command can do.

     WHAT IS STILL CLOSED, and why: `renameBinder` and `setBinderArchived`.
     C3.3 may create a Binder and change THIS card's membership of it, because
     both are part of specifying the card in front of you. Managing binders as
     objects — renaming, archiving, listing, opening one — is a surface C3.4
     builds, and neither command has a control here. */
  "createBinder",                // Collector → Card Specification, "New binder…"
  "addBinderEntry",              // Collector → Card Specification, filing this card
  /* WHERE AN OBJECT BELONGS (Batch 3B-1), AND NOW THERE IS A SCREEN. These file
     one Goal or one CollectorCopy, and the Card Specification panel sends them
     from a home control beside each of those things — the Binder view sends
     them too, from `Move` and `Remove from Binder` on a filed object.

     THEY WERE HERE ONCE BEFORE, FOR ONE COMMIT, AND THAT WAS WRONG. Batch 3A
     built the commands and listed them while no screen sent either, which is
     the one thing this file says not to do; 3A's own closure took them back out
     and 3B-1 puts them back for the reason the rule gives — the product grew
     the surface. The round trip is left written down because it is the rule
     working, not a mistake to hide.

     `addBinderEntry` above still files a CARD, and the shipping panel no longer
     sends it. It stays on this list for one release so a browser tab opened
     before this deploy keeps working; retiring the door is 3C's. */
  "fileObject",                  // Collector → Card Specification / Binder, where this thing lives
  "unfileObject",                // Collector → Card Specification / Binder, taking it out
  "removeBinderEntry",           // Collector → the legacy line, removing a card filed before 3B
  "updateCollectorCopy",         // Collector → Card Specification, correcting a copy
  "updateGoalCriteria",          // Collector → Card Specification, which copy is wanted
  /* MANAGING A BINDER AS AN OBJECT (Phase 5 C3.4). C3.1 wrote these two and
     C3.3 deliberately left them shut, because C3.3 let a person say where the
     card IN FRONT OF THEM belongs and nothing more — renaming a binder or
     putting one away are things you do to the binder itself, and there was no
     screen for that. C3.4 builds it, so they arrive with the controls that send
     them: rename in place, "Put away", and "Bring back".

     RESTORE NEEDS NO THIRD COMMAND. `setBinderArchived(id, false)` is the
     restore, which is why C3.1 chose a reversible `set` over a one-way
     `archiveBinder` — see its note in metyet-commands.js.

     AND STILL NOTHING ELSE. There is no delete command in the domain to expose;
     a Collector who wants a binder gone can empty it and put it away, and
     whether the product should ever truly delete one is a decision pilot
     evidence has not been asked for. `markBinderReviewed` is not here either:
     it is the legacy "a partner opened this Collector's cards" command and has
     nothing to do with a Binder but its name (domain/README.md). */
  "renameBinder",                // Collector → Binder, renaming one in place
  "setBinderArchived",           // Collector → Binder, "Put away" ⇄ "Bring back"
  /* A SHOP CAN FIX ITS OWN SHELF (Phase 5 C5). Batch 6 wrote both of these,
     tested both, and shipped neither — `addInventoryCopy` got a screen and
     these did not, so a Trusted Partner's inventory was write-once.

     THAT WAS NOT A COSMETIC GAP, which is why it is the one product batch
     between C4 and a pilot. A copy leaves live supply only by being archived
     or by its derived status ceasing to be `available`, and that status comes
     entirely from opportunities — none of which can exist, because the whole
     deal lifecycle is deliberately absent from this list. So a copy sold over
     the counter stayed available for ever, and went on telling a Collector
     that a shop they trust has a card it no longer has. There was no
     partner-side lever and no operator one: the only thing that stopped the
     wrong answer was the Collector giving up their own Goal.

     REMOVE ARCHIVES, IT DOES NOT DELETE. `removeInventoryCopy` sets
     `archived`, so what leaves is the claim to have the card, not the record
     of having had it. Nothing in MetYet hard-deletes a copy and this batch did
     not add the first thing that does. */
  "updateInventoryCopy",         // TP → Inventory, correcting a copy's facts
  "removeInventoryCopy",         // TP → Inventory, "Remove from inventory"

  /* ------------------------------------------- QUALIFICATION (this batch)

     LOOKING PROPERLY AT ONE PHYSICAL COPY, AND ASKING TO BE SHOWN IT. Deal
     Flow has been able to say "this exact copy, at this shop, matches what you
     asked for" since the True Match batch, and could do nothing with the
     answer. These three are the whole of doing something with it, and none of
     them is a step toward a transaction.

     WHY THESE THREE AND NOT A FOURTH. `reviewCopy` opens the look and
     `endReview` closes it; a Collector who cannot close one is a Collector
     whose Goal stays pinned to the first copy they ever opened, which is a
     known bug in the prototype and not one worth shipping again.
     `requestPhotos` is the evidence ask. Nothing else in the qualification
     area needs a surface for the Collector to do the job, so nothing else
     joins.

     WHAT THEY CANNOT DO, PROVEN IN THE DOMAIN AND NOT HERE. None creates an
     Opportunity, settles a value, reserves, commits, or advances any deal;
     each is refused outright unless the caller's own seat is a Collector in an
     accepted relationship with the shop that owns the copy; and since this
     batch, none may be started on a copy that is pending, promised or sold to
     anybody — which is the same answer in all three cases, so exposing them
     tells a rival nothing about somebody else's deal.

     `addCopyPhotos` IS DELIBERATELY NOT HERE, AND THAT LEAVES A GAP. It is the
     only command that fulfils a request, and it is a Trusted Partner action
     with no Trusted Partner surface — building one is the next batch. So a
     request made today is real, durable and correctly shown as outstanding,
     and the partner has no production door to answer it through yet. Exposing
     a command no screen can send would not fix that; the screen would. */
  /* ------------------------------------ PHOTO FULFILMENT (this batch)

     THE SHOP'S HALF OF REQUEST PHOTOS, and the reason the qualification batch
     left a loop half open: `addCopyPhotos` is the only command that closes a
     photo request, and it shipped without a surface, so a Collector could ask
     and nobody could answer. This is that surface's door.

     It is refused unless the caller's own seat is the Trusted Partner that OWNS
     the copy — not a related one, not any other shop, never a Collector. It
     fills empty faces and cannot rewrite or erase evidence inside a live deal,
     because it asks the same mutation guard `updateInventoryCopy` asks. It
     changes no price, no availability, no Pending, and creates no Opportunity:
     the only things it touches are the copy's photographs and the
     `fulfilledAt` of requests already outstanding against that copy. */
  "addCopyPhotos",               // TP → Inventory, "Add requested photos"

  "reviewCopy",                  // Collector → Deal Flow, "Inspect"
  "endReview",                   // Collector → Deal Flow, "Done inspecting"
  "requestPhotos",               // Collector → Deal Flow, "Request photos"
]);

/* ONE ANSWER FOR TWO QUESTIONS, ON PURPOSE. A command that does not exist and a
   command that exists but is not offered are refused identically, so the reply
   cannot be used to read the domain's command table from outside. */
const isExposed = (command) => typeof command === "string"
  && EXPOSED_COMMANDS.includes(command);

module.exports = { EXPOSED_COMMANDS, isExposed };
