import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CHAINS, SUPPORTED_CHAIN_KEYS } from "@/lib/onchain/chains";
import { isSignerConfigured } from "@/lib/onchain/signer";
import { relayerFunding } from "@/lib/onchain/sponsor";

export const dynamic = "force-dynamic";

const ZERO = "0x0000000000000000000000000000000000000000";

// Uptime probe for Railway healthchecks and third-party monitors.
// 200 => process reachable AND db round-trip under 2s.
// 503 => db unreachable or slow. Body always JSON for parseable alerts.
export async function GET() {
  const startedAt = Date.now();

  let dbOk = false;
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;

  const dbStart = Date.now();
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("db timeout after 2000ms")), 2000),
      ),
    ]);
    dbOk = true;
    dbLatencyMs = Date.now() - dbStart;
  } catch (e) {
    dbLatencyMs = Date.now() - dbStart;
    dbError = e instanceof Error ? e.message : String(e);
  }

  const chains = Object.fromEntries(
    SUPPORTED_CHAIN_KEYS.map((k) => {
      const c = CHAINS[k];
      return [
        k,
        {
          chainId: c.chainId,
          hexes: c.hexesAddress !== ZERO,
          badges: c.badgesAddress !== ZERO,
          rewards: c.rewardsAddress !== ZERO,
        },
      ];
    }),
  );

  const signerOk = isSignerConfigured();
  const healthy = dbOk && signerOk;

  // Which build is actually serving. Twice a deploy was reported as landed
  // while the container was still running the previous image, and both times
  // finding out meant reading `docker ps` on the host. One request answers it
  // now, so "is my change live" stops being a guess.
  //
  // Read from NEXT_PUBLIC_SENTRY_RELEASE, not BUILD_COMMIT_SHA. The sha
  // arrives as a Docker `ARG`, which exists during the build and is gone at
  // runtime unless the Dockerfile promotes it to `ENV`, so the first version
  // of this field reported null in production. `next.config.ts` puts the same
  // value in `env`, which Next inlines into the server bundle at build time,
  // so it survives into the running container. BUILD_COMMIT_SHA stays as a
  // fallback for a build that sets it as a real environment variable.
  //
  // The field caught its own bug on the first deploy, which is the argument
  // for having it.
  const commit =
    process.env.NEXT_PUBLIC_SENTRY_RELEASE?.trim() ||
    process.env.BUILD_COMMIT_SHA?.trim() ||
    null;

  // The relayer pays every claim while it is above the floor, so its balance
  // is the difference between the screen's promise being true and being a
  // lie. Read from the 60s cache the sponsor decision already uses, so a
  // monitor polling this endpoint costs no extra chain reads. A low balance
  // is not an outage and deliberately does not change `status`: the game
  // keeps working, the claim just stops being free.
  const funding = await relayerFunding("celo").catch(() => null);

  const body = {
    status: healthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    checked_in_ms: Date.now() - startedAt,
    build: { commit, release: commit?.slice(0, 7) ?? null },
    db: { ok: dbOk, latency_ms: dbLatencyMs, error: dbError },
    signer: { ok: signerOk },
    relayer: funding
      ? {
          celo: funding.celo === null ? null : Number(funding.celo.toFixed(4)),
          floor_celo: funding.floor,
          sponsors_claims: funding.fundsClaims,
        }
      : null,
    chains,
  };

  return NextResponse.json(body, { status: healthy ? 200 : 503 });
}
