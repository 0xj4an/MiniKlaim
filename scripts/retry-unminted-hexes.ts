import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Address } from "viem";
import { createLogger } from "../lib/logger";
import {
  checkRelayerBalance,
  playerCanPay,
  setMintStatus,
  sponsorRunHexes,
} from "../lib/onchain/sponsor";
import { settleBacklog } from "../lib/onchain/settleBacklog";
import { OFFERS_BEFORE_SPONSOR } from "../lib/onchain/sponsorRules";

const log = createLogger("script:retry-unminted");

/**
 * Relayer-mints two kinds of runs:
 *   1. `sponsor_failed`: the server had already agreed to sponsor and the
 *      relayer or RPC let us down.
 *   2. Runs the player has been shown OFFERS_BEFORE_SPONSOR times in the
 *      pending-claim prompt without minting, but only when they still hold
 *      too little CELO or fee stablecoin to pay. Otherwise the run is marked
 *      `sponsor_denied` and stays claimable from the app.
 *
 * Anything else (declined once, abandoned) waits for the player. The daily
 * per-wallet allowance applies to both.
 *
 * Then it settles the backlog: hexes of runs that ended more than a day ago
 * and are still not on-chain (sponsor_capped, never claimed), so they never
 * pile up again. Declined runs are left alone. Capped per pass.
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
    SELECT r.id AS run_id, r.user_address, COUNT(h.h3_id)::int AS hex_count,
      (r.mint_status = 'sponsor_failed') AS failed
    FROM runs r
    JOIN hexes h ON h.run_id = r.id AND h.minted_at IS NULL
    WHERE r.ended_at IS NOT NULL
      AND (
        (r.mint_status = 'sponsor_failed' AND r.mint_status_at < ${cutoff})
        OR (
          r.pending_offers >= ${OFFERS_BEFORE_SPONSOR}
          AND r.mint_status IS DISTINCT FROM 'claimed'
          AND r.mint_status IS DISTINCT FROM 'sponsor_failed'
          AND (r.mint_status_at IS NULL OR r.mint_status_at < ${cutoff})
        )
      )
    GROUP BY r.id, r.user_address
    ORDER BY (r.mint_status = 'sponsor_failed') DESC, MIN(r.mint_status_at) ASC NULLS FIRST
    LIMIT ${MAX_RUNS_PER_INVOCATION}
  `);
  const jobs = rows as unknown as Array<{
    run_id: string;
    user_address: string;
    hex_count: number;
    failed: boolean;
  }>;

  if (jobs.length === 0) {
    log.warn("no runs to sponsor");
    await settleOldBacklog(client);
    await client.end();
    return;
  }

  let minted = 0;
  let failed = 0;
  let capped = 0;
  let denied = 0;
  for (const job of jobs) {
    if (!job.failed) {
      // Offered enough times. Only pay if the player still cannot.
      const pay = await playerCanPay(
        job.user_address as Address,
        job.hex_count,
        0,
        "celo",
      );
      if (pay.canPay) {
        await setMintStatus(db, job.run_id, "sponsor_denied");
        denied += 1;
        continue;
      }
    }
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

  log.warn("retry complete", {
    runs: jobs.length,
    minted,
    failed,
    capped,
    denied,
  });
  if (failed === 0) await settleOldBacklog(client);
  await client.end();
}

const BACKLOG_MIN_AGE = "24 hours";
const BACKLOG_MAX_HEXES_PER_PASS = 20_000;

async function settleOldBacklog(client: postgres.Sql) {
  try {
    const res = await settleBacklog(client, {
      minAge: BACKLOG_MIN_AGE,
      maxHexes: BACKLOG_MAX_HEXES_PER_PASS,
    });
    log.warn("backlog pass", res);
  } catch (e) {
    log.error("backlog pass crashed", { error: e instanceof Error ? e.message : String(e) });
  }
}

void main();
