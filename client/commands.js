/* ============================================================================
   THE ONLY FILE IN THE BROWSER THAT NAMES A COMMAND

     const onSaveProfile = savePartnerProfile(store)
     await onSaveProfile({ about, specialties, website, instagram, email, phone })

   Phase 4 built the authenticated mutation boundary and deliberately left it
   with no caller. This is the first caller, and it is one function.

   WHY A FILE OF ITS OWN, FOR ONE LINE. Three rules meet here and each of them
   is easier to keep when there is exactly one place to look.

   A SCREEN RECEIVES A CALLBACK, NOT A STORE. `client/tp/**` holds no store,
   no session and no client, and a test keeps it that way. A section that could
   reach a store could send any command; a section handed `onSave(patch)` can
   save a profile and do nothing else. So the binding happens outside the
   product surface, and what crosses into it is a function of one argument.

   THE COMMAND NAME LIVES IN ONE PLACE. A command spelled in a screen is a
   command spelled again in the next screen, and two spellings that drift is how
   a mutation quietly stops working. Every future control adds a line here.

   THE PAYLOAD CARRIES NO AUTHORITY. `updatePartnerProfile` takes a `patch` and
   nothing else: the partner whose profile is edited is the ACTOR's, derived by
   the server from the bearer token, and the command never reads an owner from
   what was sent. There is no partnerId to omit here, because there was never
   one to send — see domain/metyet-commands.js. The server refuses `actor`,
   `seat`, `role`, `by`, `account`, `accountId`, `subject`, `sub`, `token` and
   `at` outright, so a payload that grew one would be rejected rather than
   honoured.

   NOTHING HERE RETRIES. The returned promise resolves with the boundary's own
   answer — `{ ok: true, state }` or `{ ok: false, refused }` — and rejects when
   the request could not be made or the world moved first. A caller decides what
   to do about that; this does not decide for them, because a mutation sent
   twice is two mutations and no code in a browser can tell whether the first
   one landed.
   ========================================================================== */

/* The domain's own spelling. Exported so a test can assert the browser asks for
   this command and not a near-miss of it. */
export const PARTNER_PROFILE = "updatePartnerProfile";

/* The fields `updatePartnerProfile` accepts, in the domain's own order. Every
   one of them is intentionally visible to a related Collector
   (PARTNER_FOR_COLLECTOR); none is private configuration. The default Trade %
   IS private configuration, and is deliberately absent — the command does not
   accept it and this batch does not add it. */
export const PROFILE_FIELDS = Object.freeze(["about", "specialties", "website",
  "instagram", "email", "phone"]);

export function savePartnerProfile(target) {
  if (!target || typeof target.execute !== "function") {
    throw new TypeError("savePartnerProfile: the production store is required");
  }
  return (patch) => target.execute(PARTNER_PROFILE, { patch });
}
