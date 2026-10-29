/**
 * Catch a `NEXT_PUBLIC_*` variable that was set at runtime but not at build.
 *
 * Next inlines `NEXT_PUBLIC_*` into the bundles at build time, so setting one
 * only in the container environment changes nothing the client does. That is
 * invisible: no error, no warning, and the server often reads the runtime
 * value and behaves as if the flag were on while the client, which has the
 * build-time value baked in, behaves as if it were off.
 *
 * It cost a day on 29 Oct 2026. `NEXT_PUBLIC_HEX_STRENGTH=on` reached the
 * container but not the build, so the server was ready to reinforce blocks
 * while the client stripped the player's own blocks out of the claim before
 * sending it. A player running their own route saw the new blocks painted and
 * the ones they already held ignored.
 *
 * The comparison has to be written out literally, one entry per variable:
 * `process.env.NEXT_PUBLIC_X` is what the build inlined, and
 * `process.env[name]` is the live lookup, so only the pair together shows the
 * skew. A loop over names would read the same value twice and never fire.
 */
export type EnvSkew = { name: string; baked: string; runtime: string };

/** Normalised for comparison: unset and empty mean the same thing here. */
const norm = (v: string | undefined) => (v ?? "").trim();

export function findEnvSkew(
  pairs: ReadonlyArray<{ name: string; baked: string | undefined }>,
  runtimeEnv: Record<string, string | undefined>,
): EnvSkew[] {
  const out: EnvSkew[] = [];
  for (const { name, baked } of pairs) {
    const live = norm(runtimeEnv[name]);
    if (norm(baked) !== live) {
      out.push({ name, baked: norm(baked), runtime: live });
    }
  }
  return out;
}

/**
 * The build-time values, read through literal member access so the bundler
 * substitutes each one. Everything that changes behaviour belongs here.
 */
export function bakedPublicEnv(): ReadonlyArray<{
  name: string;
  baked: string | undefined;
}> {
  return [
    { name: "NEXT_PUBLIC_HEX_STRENGTH", baked: process.env.NEXT_PUBLIC_HEX_STRENGTH },
    {
      name: "NEXT_PUBLIC_CELO_HEXES_RECORDS",
      baked: process.env.NEXT_PUBLIC_CELO_HEXES_RECORDS,
    },
    {
      name: "NEXT_PUBLIC_CELO_ATTRIBUTION_CODE",
      baked: process.env.NEXT_PUBLIC_CELO_ATTRIBUTION_CODE,
    },
    {
      name: "NEXT_PUBLIC_CELO_HEXES_ADDRESS",
      baked: process.env.NEXT_PUBLIC_CELO_HEXES_ADDRESS,
    },
    {
      name: "NEXT_PUBLIC_CELO_BADGES_ADDRESS",
      baked: process.env.NEXT_PUBLIC_CELO_BADGES_ADDRESS,
    },
    {
      name: "NEXT_PUBLIC_LINK_VERIFIER_ADDRESS",
      baked: process.env.NEXT_PUBLIC_LINK_VERIFIER_ADDRESS,
    },
    { name: "NEXT_PUBLIC_SITE_URL", baked: process.env.NEXT_PUBLIC_SITE_URL },
  ];
}

/**
 * One line per skewed variable, loud enough to find in the logs. Returns the
 * list so a caller can report it somewhere else too.
 */
export function reportEnvSkew(
  log: { error: (msg: string, data?: unknown) => void },
  runtimeEnv: Record<string, string | undefined> = process.env,
): EnvSkew[] {
  const skew = findEnvSkew(bakedPublicEnv(), runtimeEnv);
  for (const s of skew) {
    log.error(
      `${s.name} differs between the build and the runtime environment; ` +
        `the client uses the build value and ignores the other`,
      // Values, not just names: for a flag the value is the whole story, and
      // none of the variables listed here is a secret except the attribution
      // code, which is reported as set/unset rather than printed.
      s.name === "NEXT_PUBLIC_CELO_ATTRIBUTION_CODE"
        ? { baked: s.baked ? "set" : "unset", runtime: s.runtime ? "set" : "unset" }
        : { baked: s.baked || "(unset)", runtime: s.runtime || "(unset)" },
    );
  }
  return skew;
}
