import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { createSharedCache } from "@/lib/sharedCache";

export type RankedRow = {
  groupKey: string;
  rank: number;
  address: string;
  username: string | null;
  hexCount: number;
};

export type Ranking = {
  /** Every group, best first. */
  rows: RankedRow[];
  /** group_key to its row, for the pinned "me" line. */
  byGroup: Map<string, RankedRow>;
  builtAt: number;
};

/**
 * The whole ranking, built once and shared for a short while.
 *
 * It was rebuilt on every request, and the cost is not where it looks. At
 * 295,623 blocks the per-owner aggregate over `hexes` is 77 ms; the other
 * 280 ms is per-player work: a lookup per user across 9,649 users, then two
 * sorts over all of them. Only 2,226 of those users own a block, and exactly
 * one player has more than one wallet, so most of that work decides nothing.
 *
 * Rather than guess at which clause to rewrite, the whole thing is computed
 * once per TTL and both the page and the pinned row are read from memory.
 * That holds whether the table grows in blocks or in players.
 *
 * The ranking may lag by the TTL. For a leaderboard that is the right
 * trade: it was never transactional, and a player who just finished a run
 * sees their own blocks from their own stats, not from here.
 */
const TTL_MS = 30_000;

const cache = createSharedCache<Ranking>(TTL_MS);

export function clearRankingCache(): void {
  cache.clear();
}

export async function getRanking(): Promise<Ranking> {
  return cache.get("all", async () => {
    const rows = (await db.execute(sql`
      WITH group_map AS (
        SELECT
          u.address,
          u.username,
          COALESCE(
            (SELECT pw.player_id::text
             FROM player_wallets pw
             WHERE pw.address = u.address
             LIMIT 1),
            u.address
          ) AS group_key
        FROM users u
      ),
      per_address AS (
        SELECT owner_address AS address, COUNT(*) AS n
        FROM hexes
        GROUP BY owner_address
      ),
      group_hex_counts AS (
        SELECT gm.group_key, COALESCE(SUM(pa.n), 0) AS hex_count
        FROM group_map gm
        LEFT JOIN per_address pa ON pa.address = gm.address
        GROUP BY gm.group_key
      ),
      group_display AS (
        SELECT DISTINCT ON (gm.group_key)
          gm.group_key, gm.address, gm.username
        FROM group_map gm
        LEFT JOIN player_wallets pw ON pw.address = gm.address
        ORDER BY
          gm.group_key,
          (gm.username IS NOT NULL) DESC,
          COALESCE(pw.is_primary, false) DESC,
          gm.address ASC
      )
      SELECT
        gd.group_key AS "groupKey",
        gd.address AS "address",
        gd.username AS "username",
        ghc.hex_count::int AS "hexCount",
        ROW_NUMBER() OVER (ORDER BY ghc.hex_count DESC, gd.address ASC)::int AS "rank"
      FROM group_hex_counts ghc
      INNER JOIN group_display gd ON gd.group_key = ghc.group_key
      ORDER BY "rank"
    `)) as unknown as RankedRow[];

    const byGroup = new Map<string, RankedRow>();
    for (const r of rows) byGroup.set(r.groupKey, r);
    return { rows, byGroup, builtAt: Date.now() };
  });
}

/**
 * The group a wallet belongs to: its player when linked, else the address
 * itself. One indexed lookup, so it stays per-request and the ranking above
 * stays shared.
 */
export async function groupKeyFor(addressLower: string): Promise<string | null> {
  const found = (await db.execute(sql`
    SELECT COALESCE(
      (SELECT pw.player_id::text FROM player_wallets pw
       WHERE LOWER(pw.address) = ${addressLower} LIMIT 1),
      (SELECT u.address FROM users u WHERE LOWER(u.address) = ${addressLower} LIMIT 1)
    ) AS "groupKey"
  `)) as unknown as Array<{ groupKey: string | null }>;
  return found[0]?.groupKey ?? null;
}
