/* ============================================================================
   THE RUNTIME — TRUSTED TIME AND IDENTIFIERS FOR THE COMMAND LAYER (Phase 3)

     execute(state, actor, command, payload, runtime)

   A command is a pure function of canonical state, the actor and the payload,
   plus two things it cannot safely decide for itself: WHAT TIME IT IS and WHAT
   A NEW RECORD IS CALLED. Both belong to whoever owns canonical state. On a
   server that is the server; a client supplies neither. This module is the
   contract for those two capabilities and the runtimes MetYet has:

     systemRuntime()         AUTHORITATIVE. The process clock and a
                             cryptographically random id. What a server injects.
     deterministicRuntime()  AUTHORITATIVE. A scripted clock and counter ids, for
                             tests: the same commands give the same world.
     prototypeRuntime()      PROTOTYPE COMPATIBILITY ADAPTER. The in-process demo
                             has no server. Its persona shells run a frozen demo
                             calendar and pass it as `at`, and test fixtures name
                             their own record ids. This runtime honours those
                             caller proposals, exactly as the prototype behaved
                             before runtimes existed. It is the in-process store's
                             default ONLY because the prototype has no server; it
                             must never be used where the caller is untrusted.

   HOW A COMMAND READS THE RUNTIME. execute() turns the runtime into one per-call
   context (callContext) and a command reads only that:

     ctx.at                    the mutation's timestamp. ONE clock reading per
                               command, so every record a command writes carries
                               the same time.
     ctx.now()                 the same, where a timestamp must exist.
     ctx.time(proposed)        a timestamp a caller may have proposed inside a
                               nested record (copy.addedAt, activity.date).
     ctx.id(prefix, proposed)  a new record id, or one the caller proposed.

   Under an AUTHORITATIVE runtime every proposal is ignored: ctx.at is the
   runtime's clock, ctx.time() returns it and ctx.id() always mints. The
   payload's `at` never reaches a command under any runtime — execute() removes
   it before dispatch. Under the prototype adapter the same calls return the
   caller's values. One command implementation; the runtime decides whose clock
   and whose ids are authoritative.

   USER-ENTERED FACTS ARE NOT RUNTIME-OWNED. An InventoryCopy's `acquired` date,
   a fulfillment plan's meeting `date` and `time`, money, notes and message text
   are what a person said, and stay payload data under every runtime.

   No dependency: ids use the platform's Web Crypto (globalThis.crypto), present
   in every supported Node (20+) and browser. Nothing here uses Math.random.
   ========================================================================== */

const MODES = Object.freeze({ authoritative: "authoritative", prototype: "prototype" });
const BRAND = Symbol.for("metyet.runtime");

/* 32 symbols, so each random byte maps to one symbol with no bias (byte & 31).
   Lowercase, no i/l/o/u: unambiguous when read aloud or copied from a log. */
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const TOKEN_LENGTH = 16;                                   // 80 bits

function randomToken(length = TOKEN_LENGTH) {
  const webCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (!webCrypto || typeof webCrypto.getRandomValues !== "function") {
    throw new Error("MetYet runtime: no secure random source (globalThis.crypto.getRandomValues)");
  }
  const bytes = webCrypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] & 31];
  return out;
}

const isoOf = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) throw new TypeError("MetYet runtime: the clock returned an invalid time");
  return d.toISOString();
};

/* The one constructor. A runtime is a frozen, branded pair of capabilities, so
   an arbitrary object that merely has `now` and `newId` is not accepted. */
function createRuntime({ now, newId, mode = MODES.authoritative, name } = {}) {
  if (typeof now !== "function") throw new TypeError("createRuntime: now() is required");
  if (typeof newId !== "function") throw new TypeError("createRuntime: newId(prefix) is required");
  if (mode !== MODES.authoritative && mode !== MODES.prototype) {
    throw new TypeError("createRuntime: mode must be \"authoritative\" or \"prototype\"");
  }
  /* The brand is non-enumerable, so spreading a runtime's fields does not
     produce another runtime. */
  const runtime = { mode, name: name || mode, now, newId };
  Object.defineProperty(runtime, BRAND, { value: true });
  return Object.freeze(runtime);
}
const isRuntime = (r) => !!(r && typeof r === "object" && r[BRAND] === true);

/* AUTHORITATIVE — what a server injects. `clock` and `random` are seams for
   tests; production passes nothing. */
function systemRuntime({ clock = () => new Date(), random = randomToken } = {}) {
  return createRuntime({ name: "system",
    now: () => isoOf(clock()),
    newId: (prefix = "") => String(prefix) + random(TOKEN_LENGTH) });
}

/* AUTHORITATIVE, SCRIPTED — for tests. Each clock reading advances `stepMs`;
   ids are the prefix plus a zero-padded counter. Two runtimes built with the
   same options produce the same sequence. */
function deterministicRuntime({ start = "2026-01-01T00:00:00.000Z", stepMs = 1000, pad = 6 } = {}) {
  const t0 = new Date(start).getTime();
  if (!isFinite(t0)) throw new TypeError("deterministicRuntime: start must be a valid time");
  let ticks = 0;
  let seq = 0;
  return createRuntime({ name: "deterministic",
    now: () => new Date(t0 + stepMs * ticks++).toISOString(),
    newId: (prefix = "") => String(prefix) + String(++seq).padStart(pad, "0") });
}

/* PROTOTYPE COMPATIBILITY ADAPTER — see the header. Its own clock and ids are
   used only where the caller proposed nothing. */
function prototypeRuntime({ clock, random } = {}) {
  const system = systemRuntime({ clock, random });
  return createRuntime({ name: "prototype", mode: MODES.prototype,
    now: system.now, newId: system.newId });
}

/* ------------------------------------------------------------ PER-CALL CONTEXT */
const proposed = (v) => v !== undefined && v !== null && v !== "";

function readClock(runtime) {
  const t = runtime.now();
  if (typeof t !== "string" || !t) throw new TypeError("runtime.now() must return a non-empty timestamp string");
  return t;
}
function mint(runtime, prefix) {
  const p = prefix == null ? "" : String(prefix);
  const id = runtime.newId(p);
  if (typeof id !== "string" || id.length <= p.length || id.slice(0, p.length) !== p) {
    throw new TypeError("runtime.newId(prefix) must return a non-empty id beginning with the prefix");
  }
  return id;
}

function callContext(runtime, payload) {
  if (!isRuntime(runtime)) {
    throw new TypeError("execute(state, actor, command, payload, runtime): a runtime is required. "
      + "A server injects systemRuntime(); the in-process prototype store supplies prototypeRuntime().");
  }
  if (runtime.mode === MODES.prototype) {
    const at = proposed(payload && payload.at) ? payload.at : undefined;
    return Object.freeze({ mode: runtime.mode, at,
      now: () => (at !== undefined ? at : readClock(runtime)),
      time: (value) => (proposed(value) ? value : at),
      id: (prefix, value) => (proposed(value) ? value : mint(runtime, prefix)) });
  }
  const at = readClock(runtime);
  return Object.freeze({ mode: runtime.mode, at,
    now: () => at,
    time: () => at,
    id: (prefix) => mint(runtime, prefix) });
}

module.exports = { MODES, createRuntime, isRuntime, systemRuntime, deterministicRuntime,
  prototypeRuntime, callContext, randomToken };
