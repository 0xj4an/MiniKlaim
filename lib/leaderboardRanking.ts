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
  /** Lowercased wallet to its group, so resolving "me" costs no query. */
  groupOf: Map<string, string>;
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

const cache = createSharedCache<Ranking>(TTL_MS, {
  serveStaleWhileRevalidating: true,
});

export function clearRankingCache(): void {
  cache.clear();
}

export async function getRanking(): Promise<Ranking> {
  return cache.get("all", async () => {
    const [rows, groups] = await Promise.all([buildRanked(), buildGroupOf()]);
    const byGroup = new Map<string, RankedRow>();
    for (const r of rows) byGroup.set(r.groupKey, r);
    const groupOf = new Map<string, string>();
    for (const g of groups) groupOf.set(g.address.toLowerCase(), g.groupKey);
    return { rows, byGroup, groupOf, builtAt: Date.now() };
  });
}

async function buildRanked(): Promise<RankedRow[]> {
  return (await db.execute(sql`
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
}

/**
 * Every wallet with the group it ranks under. This used to be one indexed
 * lookup per request to place the pinned row, which was the last query left
 * on the hot path. It is the same grouping rule `group_map` uses above, over
 * the same snapshot, so a pinned rank cannot disagree with the list.
 *
 * A wallet that registers after the build is simply absent until the next
 * one. It would have had no blocks in this snapshot either, and a pinned row
 * with no blocks was never shown.
 */
async function buildGroupOf(): Promise<Array<{ address: string; groupKey: string }>> {
  return (await db.execute(sql`
    SELECT
      u.address AS "address",
      COALESCE(
        (SELECT pw.player_id::text
         FROM player_wallets pw
         WHERE pw.address = u.address
         LIMIT 1),
        u.address
      ) AS "groupKey"
    FROM users u
  `)) as unknown as Array<{ address: string; groupKey: string }>;
}
