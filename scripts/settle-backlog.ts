import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import postgres from "postgres";
import { createLogger } from "../lib/logger";
import { getChain } from "../lib/onchain/chains";
import { settleBacklog } from "../lib/onchain/settleBacklog";

const log = createLogger("script:settle-backlog");

/**
 * Settle every finished run's unsettled hexes through the relayer (see
 * lib/onchain/settleBacklog.ts). On 2026-10-20 this settled 34,922 hexes in
 * 303 txs. The 4-hourly cron (`runs:retry-unminted`) also runs it for runs
 * older than a day, so this script is for a manual catch-up.
 *
 * Run:  npm run runs:settle-backlog [-- --send]
 * Env:  DATABASE_URL, SERVER_SIGNER_PRIVATE_KEY, NEXT_PUBLIC_CELO_HEXES_ADDRESS,
 *       NEXT_PUBLIC_CELO_HEXES_RECORDS=1, NEXT_PUBLIC_CELO_ATTRIBUTION_CODE.
 */
async function main() {
  const send = process.argv.includes("--send");
  if (!getChain("celo").hexesRecords) {
    log.error("NEXT_PUBLIC_CELO_HEXES_RECORDS is not 1; refusing to settle on a v1 contract");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    log.error("DATABASE_URL not set");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });
  const res = await settleBacklog(sql, {
    minAge: "30 minutes",
    maxHexes: Number.MAX_SAFE_INTEGER,
    dryRun: !send,
  });
  log.info(send ? "done" : "plan (pass --send to settle)", res);
  await sql.end();
  if (res.stopped && res.stopped !== "budget") process.exit(1);
}

main().catch((e) => {
  log.error("settle-backlog crashed", { error: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
