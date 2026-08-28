import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CHAINS, SUPPORTED_CHAIN_KEYS } from "@/lib/onchain/chains";

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

  const body = {
    status: dbOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    checked_in_ms: Date.now() - startedAt,
    db: { ok: dbOk, latency_ms: dbLatencyMs, error: dbError },
    chains,
  };

  return NextResponse.json(body, { status: dbOk ? 200 : 503 });
}
