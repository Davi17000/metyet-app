/* ============================================================================
   THE PRODUCTION STORE — THE SAME THREE METHODS, A DIFFERENT REALITY

     const store = createProductionStore({ api })
     store.get()                          the server's projection, or null
     store.sub(fn)                        -> unsubscribe
     await store.execute(command, payload)

   The demo store (domain/metyet-store.js) holds the whole canonical world in a
   closure and runs domain commands in the browser: exactly right for a world
   that lives in one tab, exactly wrong for one that lives in Postgres. This is
   the other implementation of the same shape.

   WHY THE SHAPE IS THE SAME. The clients consume precisely three things from a
   store — `get`, `sub`, `execute` — and receive it as a prop, so a screen moves
   to production by being handed a different store rather than by being
   rewritten: a boundary later work migrates onto, not a migration.

   FOUR THINGS IT CANNOT DO, BY CONSTRUCTION RATHER THAN BY CARE.

   It cannot hold the canonical world: `get()` returns what the server sent, and
   no code path here produces state. It cannot run a command: this file imports
   nothing from `domain/`, and `execute` is an HTTP request. It cannot decide
   who you are: `execute` takes no actor, and the server derives the seat from
   the bearer. It cannot be written to: there is no `fixture`, no `set`, no
   `reset`, so nothing can put state in that did not come from the server —
   which is why the absence is a security property and is tested.

   WHAT IT ADDS, BECAUSE A ROUND TRIP IS NOT A FUNCTION CALL.

   `status()` — idle, loading, ready, saving, conflict, error. Screens assumed a
   mutation was instant and could not fail; neither is true against a server,
   and pretending otherwise is how a button gets pressed twice.

   SEVEN OUTCOMES A COMMAND CAN HAVE, AND NONE OF THEM IS GUESSED AT.

     nothing asked for yet      idle
     in flight                  saving      — the OLD projection is still on screen
     the server said yes        ready       — the projection it returned is adopted
     the domain said no         ready       — `lastRefusal()` names the rule
     the session is over        error       — `lastError()` is "unauthenticated"
     the world moved first      conflict    — nothing written; a re-read follows
     the network did not answer error       — the last good projection is kept

   NOTHING IS OPTIMISTIC. There is exactly one line in this file that assigns
   `state`, and it assigns what arrived in a response. A command in flight does
   not touch the projection; a refusal does not touch it; a failure does not
   blank it. What is on screen was true a moment ago, which is worth more than
   a guess about what might be true next.

   A CONFLICT IS NOT REPLAYED. `state_changed` means the server's save found the
   world had moved and rolled back, so the command did not run. Sending it again
   would be easy and wrong: the reason the world moved is the reason this command
   may no longer be right. The store RE-READS instead — `view()` is a GET and is
   safe to repeat; the command is not, and the person decides whether to ask.

   ONE COMMAND AT A TIME. A second `execute` while one is in flight throws
   rather than being sent: the server has no idempotency key, and two identical
   commands are two mutations. `pending()` lets a control disable itself and
   never reach the error. This prevents CONCURRENT duplicates and nothing more —
   a command whose response is lost may or may not have run, and no client code
   can tell, which is why nothing here retries a mutation.

   `version` — the server's, carried alongside so a screen can tell that
   something moved. It is never used to decide anything here: the server
   serializes every write under the world lock and returns the state that
   resulted, so the client's job is to believe it, not to reconcile with it.

   `execute` RETURNS THE NEW PROJECTION. Handlers that read the store back after
   a command to compose a message would break against a round trip — but the
   answer is in the reply, so a handler reads `result.state` instead.

   A REFUSAL IS NOT AN ERROR. `{ ok: false, refused }` is the domain having
   considered the request and declined it, and it is returned, exactly as the
   demo store returns it. Only a failure to ASK throws.
   ========================================================================== */

/* The one word for "the world moved first", taken from the module that owns
   the vocabulary rather than spelled again here. Two spellings that drift is
   how a conflict quietly stops being handled. */
import { FAILURES } from "./api.js";

const FAILURE_CONFLICT = FAILURES.conflict;

export const STATUS = Object.freeze({
  idle: "idle",         // nothing asked for yet
  loading: "loading",   // the first read is in flight
  ready: "ready",       // a projection is in hand
  saving: "saving",     // a command is in flight
  conflict: "conflict", // the world moved first; nothing was written
  error: "error",       // the last attempt failed; see lastError
});

/* Thrown when a command is asked for while one is already in flight. It is not
   a server answer and never reaches the network, so it is not an ApiError and
   not a refusal — it is this store declining to send a second mutation it
   cannot make safe. `pending()` exists so a caller never has to catch it. */
export class CommandInFlightError extends Error {
  constructor(running) {
    super(`a command is already in flight: ${running}`);
    this.name = "CommandInFlightError";
    this.code = "store.command-in-flight";
    this.running = running;
  }
}

export function createProductionStore({ api } = {}) {
  if (!api || typeof api.view !== "function" || typeof api.command !== "function") {
    throw new TypeError("createProductionStore: an api client (client/api.js) is required");
  }

  /* Everything the store knows, and all of it came from a response. */
  let state = null;
  let version = null;
  let status = STATUS.idle;
  let lastError = null;
  let lastRefusal = null;
  let stale = false;
  let inFlight = null;
  let running = null;          // the name of the command in flight, or null

  const subscribers = new Set();
  const announce = () => {
    subscribers.forEach((fn) => { try { fn(state); } catch (error) { /* a listener's fault */ } });
  };

  /* THE ONLY PLACE `state` IS ASSIGNED. Every value it ever holds arrived in a
     response, and there is no other line in this file that writes it — which is
     what makes "nothing here is optimistic" a property of the construction
     rather than a promise. */
  const takeState = (answer) => {
    state = answer.state;
    version = answer.version === undefined ? version : answer.version;
  };

  const adopt = (answer) => {
    takeState(answer);
    status = STATUS.ready;
    lastError = null;
    lastRefusal = null;
    stale = false;
    announce();
  };

  const failed = (error) => {
    status = STATUS.error;
    lastError = (error && error.failure) || "unexpected";
    lastRefusal = null;
    /* The last good projection is KEPT. A failed refresh does not blank the
       screen: what is on it was true a moment ago and saying so is better than
       showing nothing. `status()` is how a screen says the rest. */
    announce();
    return error;
  };

  /* A READ, after a conflict. `view()` has no side effects, so repeating it is
     safe in a way that repeating the command is not. If a read is already in
     flight this waits for it rather than asking twice. A failure here is not
     fatal: the last good projection stays and `stale()` says it may be behind. */
  const reRead = async () => {
    try {
      if (inFlight) { await inFlight; return true; }
      takeState(await api.view());
      return true;
    } catch (error) {
      return false;
    }
  };

  /* ONE MUTATION LIFECYCLE, AND EVERY MUTATION GOES THROUGH IT. `send` is the
     only thing that varies. The gate, the status, the conflict recovery, the
     refusal handling and the adoption of the answer are properties of "a
     mutation" rather than of any one command. It resolves with the server's own
     answer and throws on everything that is not one. */
  const mutate = async (name, send) => {
    /* ONE AT A TIME. The server has no idempotency key, so two commands in
       flight are two mutations, and a button pressed twice must not become two
       deals. Thrown rather than queued: the second would be sent against a
       world the first had already changed. */
    if (running !== null) throw new CommandInFlightError(running);
    running = name;
    status = STATUS.saving;
    /* The projection is NOT touched here. What is on screen stays what the
       server last said, for as long as the answer is unknown. */
    announce();

    let answer;
    try {
      answer = await send();
    } catch (error) {
      running = null;
      /* THE WORLD MOVED FIRST, so the command did not run and is not sent
         again: the reason the world moved is the reason this command may no
         longer be right. The store re-reads and the person decides. It still
         throws, and the status says conflict. */
      if (error && error.failure === FAILURE_CONFLICT) {
        const reread = await reRead();
        status = STATUS.conflict;
        lastError = FAILURE_CONFLICT;
        lastRefusal = null;
        stale = !reread;
        announce();
        throw error;
      }
      throw failed(error);
    }
    running = null;

    if (!answer.ok) {
      /* Refused: nothing changed, so nothing is adopted. The version the server
         reported is still worth taking — it may have moved for other reasons
         while this request was in flight. */
      version = answer.version === undefined ? version : answer.version;
      status = state === null ? STATUS.idle : STATUS.ready;
      lastError = null;
      lastRefusal = answer.refused;
      announce();
      return { ok: false, refused: answer.refused };
    }
    /* `adopt` reads `state` and `version` and nothing else, so anything else the
       reply carried — a credential — is handed to the caller and never stored. */
    adopt(answer);
    return answer;
  };

  return {
    /* ------------------------------------------------ THE STORE CONTRACT */
    get: () => state,

    sub(fn) {
      if (typeof fn !== "function") throw new TypeError("store.sub: a function is required");
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },

    /* No actor argument. There is nowhere to put one. */
    async execute(command, payload = {}) {
      const answer = await mutate(command, () => api.command(command, payload));
      if (!answer.ok) return answer;
      return { ok: true, value: answer.value, state: answer.state, version: answer.version };
    },

    /* THE SECOND CALLER OF THE SAME STATE MACHINE (Phase 5 Batch 2).

       Opening a Collector invitation is a mutation like any other and obeys
       every rule above — one at a time, nothing optimistic, a conflict
       re-reads and is never replayed. It differs in exactly one way: the reply
       carries a credential beside the projection, because a secret shown once
       cannot live in something that is read again on every refresh.

       So it goes through `mutate`, which is the whole of the lifecycle, and
       differs only in which request it sends and what it hands back. Two
       callers, one state machine — a second machine is how two screens start
       disagreeing about whether something is in flight. */
    async createInvitation({ recipient = null, note = null, email = null } = {}) {
      const answer = await mutate("createCollectorInvitation",
        () => api.createCollectorInvitation({ recipient, note, email }));
      if (!answer.ok) return answer;
      /* The link and the delivery outcome travel with the credential and are
         forgotten as fast: they describe one send, not the invitation. */
      return { ok: true, invitationId: answer.invitationId, credential: answer.credential,
        joinUrl: answer.joinUrl || null, delivery: answer.delivery || { requested: false },
        state: answer.state, version: answer.version };
    },

    /* THE THIRD CALLER, AND THE ONLY ONE THAT RUNS BEFORE THERE IS A WORLD
       (Batch 3A). Accepting is the first thing a Collector ever does, so it
       starts from `state === null` — which the lifecycle already copes with.

       ONE DIFFERENCE, AND IT IS THE OPPOSITE OF THE OTHERS: retrying this IS
       safe. The server records who spent a credential, so a second attempt by
       the same person converges instead of being told the invitation is dead.
       Nothing here retries on its own; for this one call, a screen may. */
    async acceptInvitation({ token } = {}) {
      const answer = await mutate("acceptCollectorInvitation",
        () => api.acceptCollectorInvitation({ token }));
      if (!answer.ok) return answer;
      return { ok: true, state: answer.state, version: answer.version };
    },

    /* WHO INVITED THEM (Batch 3D). A read that touches nothing — no projection,
       no version, no status — so it skips `mutate`, which mutates. */
    async describeInvitation({ token } = {}) {
      return api.invitationContext({ token });
    },

    /* BROWSING CARDS (Batch 6). Reads that touch nothing — no projection, no
       version, no status — so they skip `mutate`, like `describeInvitation`.
       Looking at a card changes nothing, and a failed look must not put a
       workspace into an error state. */
    /* `where`: cards, sets or artists (C1) — one door, three lists. */
    async findCards(query = "", where = "card-contexts") {
      return api.catalog(`${where}${query ? `?${query}` : ""}`);
    },
    async readCard(id) { return api.catalog(`card-contexts/${encodeURIComponent(id)}`); },
    async describeCards(ids = []) {
      const list = ids.filter(Boolean).map(encodeURIComponent).join(",");
      return list ? api.catalog(`canonical-cards?ids=${list}`) : { cards: [] };
    },

    /* ------------------------------------------------ WHAT A ROUND TRIP NEEDS */

    /* The first read, and every later refresh. Concurrent calls share one
       request: two components mounting at once must not ask twice. */
    load() {
      if (inFlight) return inFlight;
      status = state === null ? STATUS.loading : status;
      announce();
      inFlight = (async () => {
        try {
          adopt(await api.view());
        } catch (error) {
          throw failed(error);
        } finally {
          inFlight = null;
        }
        return state;
      })();
      return inFlight;
    },

    status: () => status,
    version: () => version,
    lastError: () => lastError,
    /* The domain's own word for why the last command was declined, or null.
       A screen that wants to say WHY should ask this rather than parse a
       sentence — and it is cleared by the next success, so a stale refusal
       cannot be shown against a state that has since moved. */
    lastRefusal: () => lastRefusal,
    /* The name of the command in flight, or null. A control disables itself on
       this and never has to catch CommandInFlightError. */
    pending: () => running,
    /* True only after a conflict whose recovery read ALSO failed: the
       projection on screen was true once and is now known to be behind. */
    stale: () => stale,
  };
}
