import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { and, isNull, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { runs } from "../lib/db/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("script:finalize-orphans");

/**
 * Auto-finalize orphan runs: any run without `endedAt` and started > 6 hours
 * ago is closed with `endedAt = now()`. Real players never intend a 6h+ run
 * (marathon = 4-6h max for elites); anything past that is a dropped session
 * (app killed, phone died, network lost). Un-closed orphans block the
 * client's "pending claim" prompt and skew the per-user run count.
 *
 * Idempotent. Safe to run every hour via Railway cron or LaunchAgent.
 *
 * Run:  npm run runs:finalize-orphans
 */

const ORPHAN_AGE_HOURS = 6;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    log.error("DATABASE_URL not set");
    process.exit(1);
  }
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema: { runs } });

  const cutoff = new Date(Date.now() - ORPHAN_AGE_HOURS * 3600 * 1000);

  const closed = await db
    .update(runs)
    .set({ endedAt: sql`now()` })
    .where(and(isNull(runs.endedAt), lt(runs.startedAt, cutoff)))
    .returning({ id: runs.id, startedAt: runs.startedAt });

  if (closed.length === 0) {
    log.info("no orphan runs found", { minAgeHours: ORPHAN_AGE_HOURS });
  } else {
    log.info("closed orphan runs", { count: closed.length });
    for (const r of closed) {
      const ageHrs = (Date.now() - r.startedAt.getTime()) / 3600000;
      log.info("orphan closed", { runId: r.id, ageHours: ageHrs.toFixed(1) });
    }
  }

  await client.end();
}

void main();
