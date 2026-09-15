/* ============================================================================
   THE PRODUCTION STORE — THE SAME THREE METHODS, A DIFFERENT REALITY

     const store = createProductionStore({ api })
     store.get()                          the server's projection, or null
     store.sub(fn)                        -> unsubscribe
     await store.execute(command, payload)

   The demo store (domain/metyet-store.js) holds the whole canonical world in a
   closure and runs domain commands against it in the browser. That is exactly
   right for a world that lives in one tab, and exactly wrong for a world that
   lives in Postgres. This is the other implementation of the same shape.

   WHY THE SHAPE IS THE SAME. The clients consume precisely three things from a
   store — `get`, `sub`, `execute` — and receive it as a prop. So a screen moves
   to production by being handed a different store, one at a time, rather than
   by being rewritten. That is the whole point of this batch: a boundary later
   work migrates onto, not a migration.

   FOUR THINGS IT CANNOT DO, BY CONSTRUCTION RATHER THAN BY CARE.

   It cannot hold the canonical world. `get()` returns what the server sent,
   which is already a projection for one seat. There is no code path here that
   produces state: every value it ever returns arrived in a response.

   It cannot run a command. This file imports nothing from `domain/`. There is
   no command table, no runtime, no reducer. `execute` is an HTTP request.

   It cannot decide who you are. `execute` takes no actor — the signature has
   nowhere to put one. The server derives the seat from the bearer, and the
   projection it returns is the answer to "who am I" as well as "what can I see".

   It cannot be written to. There is no `fixture`, no `set`, no `reset`. The
   demo store has those and needs them — scenario controls rewrite the world
   directly. Here there is no way to put state in that did not come from the
   server, which is why the absence is a security property and is tested.

   WHAT IT ADDS, BECAUSE A ROUND TRIP IS NOT A FUNCTION CALL.

   `status()` — idle, loading, ready, saving, error. Every screen today assumes
   a mutation is instant and cannot fail; none of that is true any more, and
   pretending otherwise is how a button gets pressed twice.

   `version` — the server's, carried alongside so a screen can tell that
   something moved. It is never used to decide anything here: the server
   serializes every write under the world lock and returns the state that
   resulted, so the client's job is to believe it, not to reconcile with it.

   `execute` RETURNS THE NEW PROJECTION. Several handlers today read the store
   back immediately after a command to compose a message from the result. That
   pattern breaks against a round trip — but it does not have to be rewritten
   into something exotic, because the answer comes back in the reply. A handler
   reads `result.state` instead of calling `store.get()` again.

   A REFUSAL IS NOT AN ERROR. `{ ok: false, refused }` is the domain having
   considered the request and declined it, and it is returned, exactly as the
   demo store returns it. Only a failure to ASK — no session, unreachable,
   unreadable — throws.
   ========================================================================== */

export const STATUS = Object.freeze({
  idle: "idle",         // nothing asked for yet
  loading: "loading",   // the first read is in flight
  ready: "ready",       // a projection is in hand
  saving: "saving",     // a command is in flight
  error: "error",       // the last attempt failed; see lastError
});

export function createProductionStore({ api } = {}) {
  if (!api || typeof api.view !== "function" || typeof api.command !== "function") {
    throw new TypeError("createProductionStore: an api client (client/api.js) is required");
  }

  /* Everything the store knows, and all of it came from a response. */
  let state = null;
  let version = null;
  let status = STATUS.idle;
  let lastError = null;
  let inFlight = null;

  const subscribers = new Set();
  const announce = () => {
    subscribers.forEach((fn) => { try { fn(state); } catch (error) { /* a listener's fault */ } });
  };

  const adopt = (answer) => {
    state = answer.state;
    version = answer.version === undefined ? version : answer.version;
    status = STATUS.ready;
    lastError = null;
    announce();
  };

  const failed = (error) => {
    status = STATUS.error;
    lastError = (error && error.failure) || "unexpected";
    /* The last good projection is KEPT. A failed refresh does not blank the
       screen: what is on it was true a moment ago and saying so is better than
       showing nothing. `status()` is how a screen says the rest. */
    announce();
    return error;
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
      status = STATUS.saving;
      announce();
      let answer;
      try {
        answer = await api.command(command, payload);
      } catch (error) {
        throw failed(error);
      }
      if (!answer.ok) {
        /* Refused: nothing changed, so nothing is adopted. The version the
           server reported is still worth taking — it may have moved for other
           reasons while this request was in flight. */
        version = answer.version === undefined ? version : answer.version;
        status = state === null ? STATUS.idle : STATUS.ready;
        announce();
        return { ok: false, refused: answer.refused };
      }
      adopt(answer);
      return { ok: true, value: answer.value, state: answer.state, version: answer.version };
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
  };
}
