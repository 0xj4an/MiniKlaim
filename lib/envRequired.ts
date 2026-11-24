/**
 * Server settings a feature cannot work without, checked at startup.
 *
 * On 24 Nov 2026 place search went to production thirteen minutes before
 * its key did: the route answered 503 to the first players who tried it and
 * nothing said why until the access log was read. A missing key is silent
 * by nature (the code that needs it is written to cope), so the process
 * says it once when it boots and /api/health lists it for as long as it
 * lasts. Names only, never values.
 *
 * Add a line here in the same change that adds a feature needing a key.
 *
 * ADMIN_SECRET is left out on purpose: the three /api/admin routes are
 * launch-day maintenance tools, they answer closed without it, and no player
 * path depends on them. Listing it made production report a problem that
 * is not one.
 */
export type RequiredEnv = { name: string; feature: string };

export const REQUIRED_SERVER_ENV: readonly RequiredEnv[] = [
  { name: "DATABASE_URL", feature: "everything" },
  { name: "SERVER_SIGNER_PRIVATE_KEY", feature: "claims, badges and the challenge" },
  { name: "GEOAPIFY_API_KEY", feature: "place search" },
  { name: "RESEND_API_KEY", feature: "the support form" },
];

export function missingServerEnv(
  env: Record<string, string | undefined> = process.env,
  required: readonly RequiredEnv[] = REQUIRED_SERVER_ENV,
): RequiredEnv[] {
  return required.filter(({ name }) => !(env[name] ?? "").trim());
}

/** One error line per missing setting: error survives the log floor. */
export function reportMissingEnv(
  log: { error: (message: string, data?: Record<string, unknown>) => void },
  env: Record<string, string | undefined> = process.env,
): RequiredEnv[] {
  const missing = missingServerEnv(env);
  for (const m of missing) {
    log.error("required setting is missing", { name: m.name, feature: m.feature });
  }
  return missing;
}
