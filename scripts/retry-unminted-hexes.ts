import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hexes, runs } from "../lib/db/schema";
import { captureBatch } from "../lib/onchain/hexes";

/**
 * Retry the sponsored `captureBatch` for runs that finished but never got
 * their hexes minted on-chain. Covers the failure modes:
 *   1. Client-driven `claimRun` never fired (app killed after finish).
 *   2. Client `claimRun` reverted (RPC hiccup, out-of-gas).
 *   3. Client called `/sponsor-mint` but the backend RPC was down.
 *
 * Idempotent because `captureBatch` mint-or-transfers per hex; already-minted
 * ids don't double up (see MiniKlaimHexes.capture). The `/claimed` endpoint
 * later marks `hexes.mintedAt` when the on-chain tx is confirmed.
 *
 * Safe to run every 15-30 min via Railway cron. Rate-limited by the
 * `endedAt < now() - 15 min` filter so we don't race the client's own claim.
 *
 * Run:  npm run runs:retry-unminted
 *
 * Env:  DATABASE_URL, SERVER_SIGNER_PRIVATE_KEY, NEXT_PUBLIC_CELO_HEXES_ADDRESS.
 */

const MIN_AGE_MIN = 15;
const MAX_RUNS_PER_INVOCATION = 20;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema: { runs, hexes } });

  const cutoff = new Date(Date.now() - MIN_AGE_MIN * 60_000);

  // Distinct runs with at least one unminted hex, finished more than MIN_AGE_MIN ago.
  const rows = await db.execute<{
    run_id: string;
    user_address: string;
    hex_count: number;
  }>(sql`
    SELECT h.run_id, r.user_address, COUNT(*)::int AS hex_count
    FROM hexes h
    JOIN runs r ON r.id = h.run_id
    WHERE h.minted_at IS NULL
      AND h.run_id IS NOT NULL
      AND r.ended_at IS NOT NULL
      AND r.ended_at < ${cutoff}
    GROUP BY h.run_id, r.user_address
    ORDER BY r.ended_at ASC
    LIMIT ${MAX_RUNS_PER_INVOCATION}
  `);

  const jobs = rows as unknown as Array<{
    run_id: string;
    user_address: string;
    hex_count: number;
  }>;

  if (jobs.length === 0) {
    console.log(`no runs with unminted hexes older than ${MIN_AGE_MIN}min`);
    await client.end();
    return;
  }

  console.log(`found ${jobs.length} runs with unminted hexes:`);
  for (const job of jobs) {
    console.log(`  run ${job.run_id} (${job.hex_count} unminted, player ${job.user_address})`);
  }

  let ok = 0;
  let fail = 0;
  for (const job of jobs) {
    const unminted = await db
      .select({ h3Id: hexes.h3Id })
      .from(hexes)
      .where(and(eq(hexes.runId, job.run_id), isNull(hexes.mintedAt)));
    const h3Ids = unminted.map((h) => h.h3Id);
    if (h3Ids.length === 0) continue;

    const result = await captureBatch(job.user_address as `0x${string}`, h3Ids);
    if (result.ok === true) {
      await db
        .update(hexes)
        .set({ mintedAt: sql`now()`, mintTxHash: result.txHash })
        .where(and(eq(hexes.runId, job.run_id), isNull(hexes.mintedAt)));
      console.log(`  ok run ${job.run_id} minted ${h3Ids.length} hexes (tx ${result.txHash})`);
      ok += 1;
    } else {
      console.log(
        `  fail run ${job.run_id}: ${result.reason} ${result.error?.slice(0, 100) ?? ""}`,
      );
      fail += 1;
    }
  }

  console.log(`\ndone: ${ok} succeeded, ${fail} failed`);
  await client.end();
}

void main();
