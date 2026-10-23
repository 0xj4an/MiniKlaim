import type postgres from "postgres";
import type { Address } from "viem";
import { createLogger } from "@/lib/logger";
import { getChain } from "@/lib/onchain/chains";
import { captureBatch, hexesPublicClient } from "@/lib/onchain/hexes";

const log = createLogger("onchain:settleBacklog");

/** Relayer chunk on Hexes v2 (~3k gas per recorded hex, ~12M gas per tx). */
export const SETTLE_CHUNK = 4000;

export type SettleOptions = {
  /** Only runs that ended at least this long ago (Postgres interval). */
  minAge: string;
  /** Stop after this many hexes in one call. */
  maxHexes: number;
  /** Plan only: count, send nothing. */
  dryRun?: boolean;
};

export type SettleResult = {
  owners: number;
  pending: number;
  settled: number;
  txs: number;
  stopped?: string;
};

/**
 * Settle finished runs' unsettled hexes through the relayer, whatever their
 * mint status (capped, denied, never reported), except runs the player
 * declined. Hexes v2 only: a recorded hex costs ~3k gas, so this is cents.
 * Rows go to `sponsored_mints` with kind `backlog`; the daily sponsor
 * allowance is not touched. Each tx carries the ERC-8021 attribution tag
 * (captureBatch appends it). Idempotent: every pass re-reads
 * `minted_at IS NULL`.
 */
export async function settleBacklog(
  sql: postgres.Sql,
  opts: SettleOptions,
): Promise<SettleResult> {
  if (!getChain("celo").hexesRecords) {
    return { owners: 0, pending: 0, settled: 0, txs: 0, stopped: "not-v2" };
  }
  const owners = await sql<{ owner: string; n: number }[]>`
    SELECT h.owner_address AS owner, COUNT(*)::int AS n
    FROM hexes h JOIN runs r ON r.id = h.run_id
    WHERE h.minted_at IS NULL AND r.ended_at < now() - ${opts.minAge}::interval
      AND COALESCE(r.mint_status, '') <> 'declined'
    GROUP BY 1 ORDER BY 2 DESC`;
  const pending = owners.reduce((a, o) => a + o.n, 0);
  const result: SettleResult = { owners: owners.length, pending, settled: 0, txs: 0 };
  if (opts.dryRun || pending === 0) return result;

  const client = hexesPublicClient("celo");
  for (const o of owners) {
    for (;;) {
      const budget = opts.maxHexes - result.settled;
      if (budget <= 0) return { ...result, stopped: "budget" };
      const rows = await sql<{ h3_id: string; run_id: string }[]>`
        SELECT h.h3_id, h.run_id FROM hexes h JOIN runs r ON r.id = h.run_id
        WHERE h.owner_address = ${o.owner} AND h.minted_at IS NULL
          AND r.ended_at < now() - ${opts.minAge}::interval
          AND COALESCE(r.mint_status, '') <> 'declined'
        ORDER BY h.h3_id LIMIT ${Math.min(SETTLE_CHUNK, budget)}`;
      if (rows.length === 0) break;
      const ids = rows.map((r) => r.h3_id);
      const res = await captureBatch(o.owner as Address, ids, "celo");
      if (res.ok !== true) {
        log.error("captureBatch failed; stopping", { owner: o.owner, reason: res.reason });
        return { ...result, stopped: "capture-failed" };
      }
      const rc = await client.waitForTransactionReceipt({ hash: res.txHash, timeout: 120_000 });
      if (rc.status !== "success") {
        log.error("tx reverted; stopping", { owner: o.owner, txHash: res.txHash });
        return { ...result, stopped: "reverted" };
      }
      await sql`UPDATE hexes SET minted_at = now(), mint_tx_hash = ${res.txHash}
        WHERE h3_id = ANY(${ids}) AND minted_at IS NULL`;
      const runIds = [...new Set(rows.map((r) => r.run_id))];
      await sql`UPDATE runs SET mint_status = 'sponsored', mint_status_at = now()
        WHERE id = ANY(${runIds})
          AND NOT EXISTS (SELECT 1 FROM hexes h WHERE h.run_id = runs.id AND h.minted_at IS NULL)`;
      await sql`INSERT INTO sponsored_mints (user_address, run_id, kind, count, tx_hash)
        VALUES (${o.owner}, ${runIds[0]}, 'backlog', ${rows.length}, ${res.txHash})`;
      result.settled += rows.length;
      result.txs += 1;
      log.info("settled", { owner: o.owner, count: rows.length, gas: rc.gasUsed.toString(), txHash: res.txHash });
    }
  }
  return result;
}
