/* ============================================================================
   PROVISIONING — LINKING A VERIFIED SIGN-IN TO AN ACTOR THAT ALREADY EXISTS

     linkActorAccount({ repository, accounts, subject, role, actorId })
       -> { accountId, role, actor }
     listActors(repository)  -> { collectors: [{ id, name }], partners: [...] }

   The founder's only provisioning step, and deliberately the narrowest one that
   works: it takes an explicit provider subject, an explicit role, and an
   explicit actor id, and it links them. Nothing is inferred from an email
   address or a name, nothing is created, and there is no HTTP route — this runs
   from the operator command line (server/cli.js).

   THE ACTOR MUST ALREADY EXIST. The canonical world is read first and the id
   must be a Collector or a Trusted Partner in it, matching the role given. An
   account that points at nothing would authenticate and then fail every request
   (actor_unknown), so it is refused here instead.

   WHAT THIS CANNOT DO, ON PURPOSE. It cannot create the Collector or the
   Trusted Partner. The domain has no command that brings a Trusted Partner into
   existence — `inviteCollector` creates a pending Collector, and only a partner
   can send it — so on a freshly bootstrapped, empty world there is nobody to
   link to yet. That gap is real and is left visible rather than papered over
   with SQL that writes canonical rows behind execute()'s back: the world would
   then hold records no command authored, which is exactly what the command
   layer exists to prevent. Closing it needs a domain decision (an admin command
   that registers a Trusted Partner), not a script.
   ========================================================================== */

const ROLES = { collector: "collectors", tp: "partners" };

class ProvisioningError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "ProvisioningError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

const isId = (v) => typeof v === "string" && v.length > 0;

async function linkActorAccount({ repository, accounts, subject, role, actorId } = {}) {
  if (!isId(subject)) {
    throw new ProvisioningError("provisioning.subject-required",
      "Give the identity provider's subject (the verified `sub` of that person's sign-in), not an email address.");
  }
  if (!ROLES[role]) {
    throw new ProvisioningError("provisioning.role-required", 'Give the role: "collector" or "tp".');
  }
  if (!isId(actorId)) {
    throw new ProvisioningError("provisioning.actor-required", "Give the id of the Collector or Trusted Partner to link to.");
  }

  const world = await repository.loadWorld();
  const collection = world[ROLES[role]] || [];
  const actor = collection.find((record) => record.id === actorId);
  if (!actor) {
    const other = role === "tp" ? (world.collectors || []) : (world.partners || []);
    const mismatched = other.some((record) => record.id === actorId);
    throw new ProvisioningError("provisioning.actor-unknown",
      mismatched
        ? `"${actorId}" exists, but as a ${role === "tp" ? "Collector" : "Trusted Partner"}, not as a ${role === "tp" ? "Trusted Partner" : "Collector"}.`
        : `There is no ${role === "tp" ? "Trusted Partner" : "Collector"} "${actorId}" in the canonical world, so nothing was linked.`,
      { actorId, role });
  }

  return accounts.linkAccount({ subject, role, ...(role === "tp" ? { partnerId: actorId } : { collectorId: actorId }) });
}

/* The ids an operator can link to, so nobody has to guess or query by hand. */
async function listActors(repository) {
  const world = await repository.loadWorld();
  const named = (records) => records.map((r) => ({ id: r.id, name: r.name || null }));
  return { collectors: named(world.collectors || []), partners: named(world.partners || []) };
}

module.exports = { linkActorAccount, listActors, ProvisioningError, ROLES };
