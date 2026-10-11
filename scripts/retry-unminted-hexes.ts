import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Address } from "viem";
import { createLogger } from "../lib/logger";
import { checkRelayerBalance, sponsorRunHexes } from "../lib/onchain/sponsor";

const log = createLogger("script:retry-unminted");

/**
 * Retry relayer mints that failed on our side: runs marked `sponsor_failed`
 * (relayer out of gas, RPC down, tx reverted) after the server had already
 * agreed to sponsor them.
 *
 * Runs the player declined, abandoned, or could pay for are left alone. The
 * player can still claim those from the app and pay the fee. The daily
 * per-wallet allowance applies here too.
 *
 * Run:  npm run runs:retry-unminted
 * Env:  DATABASE_URL, SERVER_SIGNER_PRIVATE_KEY, NEXT_PUBLIC_CELO_HEXES_ADDRESS.
 */

const MIN_AGE_MIN = 15;
const MAX_RUNS_PER_INVOCATION = 20;
// Smaller txs than the web route so a thin relayer still makes progress.
const HEXES_PER_BATCH = 100;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    log.error("DATABASE_URL not set");
    process.exit(1);
  }
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  await checkRelayerBalance("celo");

  // ISO string: postgres-js does not bind Date instances in db.execute.
  const cutoff = new Date(Date.now() - MIN_AGE_MIN * 60_000).toISOString();
  const rows = await db.execute<{
    run_id: string;
    user_address: string;
    hex_count: number;
  }>(sql`
    SELECT r.id AS run_id, r.user_address, COUNT(h.h3_id)::int AS hex_count
    FROM runs r
    JOIN hexes h ON h.run_id = r.id AND h.minted_at IS NULL
    WHERE r.mint_status = 'sponsor_failed'
      AND r.mint_status_at < ${cutoff}
    GROUP BY r.id, r.user_address
    ORDER BY MIN(r.mint_status_at) ASC
    LIMIT ${MAX_RUNS_PER_INVOCATION}
  `);
  const jobs = rows as unknown as Array<{
    run_id: string;
    user_address: string;
    hex_count: number;
  }>;

  if (jobs.length === 0) {
    log.warn("no failed sponsor mints to retry");
    await client.end();
    return;
  }

  let minted = 0;
  let failed = 0;
  let capped = 0;
  for (const job of jobs) {
    const result = await sponsorRunHexes(db, {
      runId: job.run_id,
      player: job.user_address as Address,
      chainKey: "celo",
      chunkSize: HEXES_PER_BATCH,
    });
    minted += result.minted;
    if (result.status === "sponsor_failed") {
      failed += 1;
      log.warn("retry failed; stopping this pass", {
        runId: job.run_id,
        error: result.error?.slice(0, 120),
      });
      // Most likely the relayer is out of gas or the RPC is down; the next
      // pass picks the rest up.
      break;
    }
    if (result.status === "sponsor_capped") capped += 1;
  }

  log.warn("retry complete", { runs: jobs.length, minted, failed, capped });
  await client.end();
}

void main();
