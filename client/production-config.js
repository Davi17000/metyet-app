/* ============================================================================
   THE THREE PUBLIC VALUES A PRODUCTION BROWSER NEEDS, AND THE CHECK ON THEM

     const config = readProductionConfig()          from the build's defines
     const config = readProductionConfig({ ... })   explicitly, in a test

     -> { apiUrl, supabaseUrl, publishableKey }
     (throws ProductionConfigError)

   None of these is a secret. The API's address is where the product lives; the
   Supabase project URL is in every sign-in email's link; the publishable key is
   published — that is its name, and it grants nothing on its own. A browser
   bundle cannot keep a secret, so the rule is not "hide these", it is **let
   nothing else in**, and say so loudly if something tries.

   WHY A BUILD-TIME DEFINE AND NOT A FETCH. A config request at boot is one more
   thing to fail, one more round trip before a person can type their address,
   and one more endpoint to get wrong. The values change when the deployment
   changes, which is when the bundle is rebuilt anyway. `site.build.mjs` already
   substitutes its two booleans this way; this is the same mechanism.

   WHY THE API URL DEFAULTS TO THIS PAGE'S ORIGIN. The production client is
   served BY the API server, so they are the same origin and the correct value
   is the one the browser is already on. That default is not a convenience: it
   means the common deployment has nothing to misconfigure, and it removes
   cross-origin entirely rather than configuring it.

   WHAT IS REFUSED, AT BOOT RATHER THAN AT THE FIRST REQUEST. A missing value; a
   plaintext address for anywhere but this machine, because every request
   carries a bearer; and a SECRET key, because one in a browser bundle is the
   whole database in everyone's hands. Refusing at boot means a misbuilt bundle
   shows one clear message instead of failing differently on each screen.
   ========================================================================== */

import { isSafeApiUrl } from "./api.js";

export class ProductionConfigError extends Error {
  constructor(problems) {
    super(`The production build is not configured: ${problems.join("; ")}`);
    this.name = "ProductionConfigError";
    this.code = "config.invalid";
    this.problems = problems;
  }
}

/* A define that the bundler did not substitute is not a value. Guarded with
   `typeof` because an unsubstituted identifier is a ReferenceError, not
   undefined — the same guard shared/dev-flag.js uses. */
const defined = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);

const fromBuild = () => ({
  /* eslint-disable no-undef */
  apiUrl: typeof __METYET_API_URL__ === "string" ? __METYET_API_URL__ : null,
  supabaseUrl: typeof __METYET_SUPABASE_URL__ === "string" ? __METYET_SUPABASE_URL__ : null,
  publishableKey: typeof __METYET_SUPABASE_KEY__ === "string" ? __METYET_SUPABASE_KEY__ : null,
  /* eslint-enable no-undef */
});

/* Where this page is served from, when nothing said otherwise. */
const thisOrigin = () => {
  try {
    return typeof location === "object" && location && typeof location.origin === "string" ? location.origin : null;
  } catch (error) { return null; }
};

/* A secret key must never be built into a browser bundle. Both spellings, the
   same two the server refuses: the current `sb_secret_…` and the legacy
   service-role JWT, whose payload names its own role.

   This is the one place the client looks inside a token, and it is not to
   believe anything it says — it is to refuse a key outright. A payload that
   will not parse is simply not a service-role JWT. */
const isSecretKey = (key) => {
  if (typeof key !== "string") return false;
  if (/^sb_secret_/.test(key)) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const json = typeof atob === "function" ? atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
      : Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(json);
    return Boolean(payload) && payload.role === "service_role";
  } catch (error) { return false; }
};

export function readProductionConfig(overrides = {}) {
  const build = fromBuild();
  const problems = [];

  const apiUrl = defined(overrides.apiUrl) || defined(build.apiUrl) || thisOrigin();
  const supabaseUrl = defined(overrides.supabaseUrl) || defined(build.supabaseUrl);
  const publishableKey = defined(overrides.publishableKey) || defined(build.publishableKey);

  if (!apiUrl) problems.push("METYET_API_URL is not set and this page has no origin to fall back to");
  else if (!isSafeApiUrl(apiUrl)) problems.push("METYET_API_URL must be https (http only for this machine) — every request carries a bearer token");

  if (!supabaseUrl) problems.push("SUPABASE_URL is not set");
  else if (!isSafeApiUrl(supabaseUrl)) problems.push("SUPABASE_URL must be https (http only for this machine) — sign-in carries a one-time code and returns a session");

  if (!publishableKey) problems.push("SUPABASE_PUBLISHABLE_KEY is not set");
  else if (isSecretKey(publishableKey)) problems.push("SUPABASE_PUBLISHABLE_KEY is a secret or service-role key, and this is a browser bundle — use the publishable (anon) key");

  if (problems.length) throw new ProductionConfigError(problems);
  return { apiUrl: apiUrl.replace(/\/+$/, ""), supabaseUrl: supabaseUrl.replace(/\/+$/, ""), publishableKey };
}

/* What may be shown or logged: that each value is present, never what it is.
   The API host is named because a person debugging needs to know which server
   they reached, and it is the address in their own URL bar. */
export const describeConfig = (config) => ({
  apiUrl: config.apiUrl,
  supabaseConfigured: Boolean(config.supabaseUrl),
  keyConfigured: Boolean(config.publishableKey),
});
