import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import postgres from "postgres";
import type { Address } from "viem";
import { createLogger } from "../lib/logger";
import { getChain } from "../lib/onchain/chains";
import { captureBatch, hexesPublicClient } from "../lib/onchain/hexes";

const log = createLogger("script:settle-backlog");

/**
 * Settle every finished run's unsettled hexes through the relayer, whatever
 * its mint status (capped, denied, never reported), except runs the player
 * declined. Meant for Hexes v2, where a recorded hex costs ~3.5k gas, so the
 * whole backlog costs cents. On 2026-10-20 this settled 34,922 hexes in 303
 * txs. The daily sponsor allowance is not touched: rows are logged in
 * `sponsored_mints` with kind `backlog`.
 *
 * Idempotent: each pass re-reads `minted_at IS NULL`. Without `--send` it only
 * prints the plan.
 *
 * Run:  npm run runs:settle-backlog [-- --send]
 * Env:  DATABASE_URL, SERVER_SIGNER_PRIVATE_KEY, NEXT_PUBLIC_CELO_HEXES_ADDRESS,
 *       NEXT_PUBLIC_CELO_HEXES_RECORDS=1.
 */

const CHUNK = 4000;
const MIN_AGE = "30 minutes";

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
  const client = hexesPublicClient("celo");

  const owners = await sql<{ owner: string; n: number }[]>`
    SELECT h.owner_address AS owner, COUNT(*)::int AS n
    FROM hexes h JOIN runs r ON r.id = h.run_id
    WHERE h.minted_at IS NULL AND r.ended_at < now() - ${MIN_AGE}::interval
      AND COALESCE(r.mint_status, '') <> 'declined'
    GROUP BY 1 ORDER BY 2 DESC`;
  const total = owners.reduce((a, o) => a + o.n, 0);
  log.info("backlog", { owners: owners.length, hexes: total });
  if (!send) {
    console.log(owners.slice(0, 10));
    await sql.end();
    return;
  }

  let settled = 0;
  for (const o of owners) {
    for (;;) {
      const rows = await sql<{ h3_id: string; run_id: string }[]>`
        SELECT h.h3_id, h.run_id FROM hexes h JOIN runs r ON r.id = h.run_id
        WHERE h.owner_address = ${o.owner} AND h.minted_at IS NULL
          AND r.ended_at < now() - ${MIN_AGE}::interval
          AND COALESCE(r.mint_status, '') <> 'declined'
        ORDER BY h.h3_id LIMIT ${CHUNK}`;
      if (rows.length === 0) break;
      const ids = rows.map((r) => r.h3_id);
      const res = await captureBatch(o.owner as Address, ids, "celo");
      if (res.ok !== true) {
        log.error("captureBatch failed; stopping", { owner: o.owner, reason: res.reason });
        await sql.end();
        process.exit(1);
      }
      const rc = await client.waitForTransactionReceipt({ hash: res.txHash, timeout: 120_000 });
      if (rc.status !== "success") {
        log.error("tx reverted; stopping", { owner: o.owner, txHash: res.txHash });
        await sql.end();
        process.exit(1);
      }
      await sql`UPDATE hexes SET minted_at = now(), mint_tx_hash = ${res.txHash}
        WHERE h3_id = ANY(${ids}) AND minted_at IS NULL`;
      const runIds = [...new Set(rows.map((r) => r.run_id))];
      await sql`UPDATE runs SET mint_status = 'sponsored', mint_status_at = now()
        WHERE id = ANY(${runIds})
          AND NOT EXISTS (SELECT 1 FROM hexes h WHERE h.run_id = runs.id AND h.minted_at IS NULL)`;
      await sql`INSERT INTO sponsored_mints (user_address, run_id, kind, count, tx_hash)
        VALUES (${o.owner}, ${runIds[0]}, 'backlog', ${rows.length}, ${res.txHash})`;
      settled += rows.length;
      log.info("settled", { owner: o.owner, count: rows.length, gas: rc.gasUsed.toString(), txHash: res.txHash });
    }
  }
  log.info("done", { settled });
  await sql.end();
}

main().catch((e) => {
  log.error("settle-backlog crashed", { error: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
