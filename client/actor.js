/* ============================================================================
   WHO THE SERVER SAID YOU ARE — READ, NEVER DECIDED

     describeActor(state)  ->  { id, name, seat }

   One function, because two would drift. Sign-in used to carry its own copy;
   now routing and presentation read the same twelve lines, and a test reads
   them too. This is the whole of the client's identity logic.

   THE SHAPE IS THE DOMAIN'S, NOT OURS. A projected actor is a seat plus the id
   under that seat's own field:

     { seat: "tp",        partnerId:   "p-3f9a" }
     { seat: "collector", collectorId: "c-8x21" }

   There is no `actor.id`. Reading one is exactly the bug the operator command
   had two batches ago, which is why the field name comes from a table keyed by
   seat rather than from a guess.

   THE NAME IS LOOKED UP BY THE ACTOR'S OWN ID, NOT TAKEN FROM THE TOP. For a
   Trusted Partner the server sends exactly one partner record — their own — so
   `partners[0]` would work today and would be wrong on principle: "the first
   record" is an assumption about the server, while the actor's id is the
   server's own answer. A projection that arrived carrying somebody else's
   record cannot rename the person signed in.

   IT REPORTS, IT DOES NOT DECIDE. An actor with a seat and no id yields
   `{ id: null, name: null, seat: "tp" }` — a faithful account of what arrived,
   not a verdict. Deciding what to do about it belongs to the router, which
   requires a seat AND an id before it will render anything, so an actor the
   server did not fully name reaches no product surface at all.
   ========================================================================== */

/* Seat -> the field carrying that seat's id, and the collection holding that
   seat's own record. Both come from domain/metyet-projection.js. */
export const SEATS = Object.freeze({
  tp: Object.freeze({ id: "partnerId", records: "partners", label: "Trusted Partner" }),
  collector: Object.freeze({ id: "collectorId", records: "collectors", label: "Collector" }),
});

const NOBODY = Object.freeze({ id: null, name: null, seat: null });

export function describeActor(state) {
  const actor = (state && typeof state === "object" && state.actor) || null;
  if (!actor || typeof actor !== "object") return NOBODY;
  /* An unrecognised seat is not a seat. There is no default and no nearest
     match: a word this table does not contain means we could not tell. */
  const seat = Object.prototype.hasOwnProperty.call(SEATS, actor.seat) ? SEATS[actor.seat] : null;
  if (!seat) return NOBODY;

  const claimed = actor[seat.id];
  const id = typeof claimed === "string" && claimed.trim() ? claimed.trim() : null;
  if (!id) return { id: null, name: null, seat: actor.seat };

  const records = Array.isArray(state[seat.records]) ? state[seat.records] : [];
  const mine = records.find((r) => r && r.id === id) || null;
  const name = mine && typeof mine.name === "string" && mine.name.trim() ? mine.name.trim() : null;
  return { id, name, seat: actor.seat };
}

/* True only when the projection named a seat AND an id under it. Everything
   that renders a product surface is gated on this. */
export const isIdentified = (who) => Boolean(who && who.seat && who.id);

/* The label for a seat, for the one place a person is told which product they
   are looking at. Null for anything unrecognised — there is no default seat. */
export const seatLabel = (seat) => (SEATS[seat] ? SEATS[seat].label : null);
