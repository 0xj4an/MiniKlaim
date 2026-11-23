import { cellToParent } from "h3-js";
import { and, count, desc, inArray, isNotNull, sql } from "drizzle-orm";
import type { Address } from "viem";
import { db } from "@/lib/db";
import { hexes, runs } from "@/lib/db/schema";
import { addressesForPlayer } from "@/lib/players";
import { conquestsOf } from "@/lib/playerConquests";
import { type BadgeStats, eligibleFromStats } from "@/lib/onchain/badgeRules";
import { getPlayerStreaks } from "@/lib/runs/streak";

export { badgeProgress, BADGE_RULES, eligibleFromStats } from "@/lib/onchain/badgeRules";
export type { BadgeProgress, BadgeStats } from "@/lib/onchain/badgeRules";

// A "city" is an H3 resolution-5 cluster (~city scale), the same grouping the
// territory map uses. Distinct res-5 parents of a player's owned hexes.
const CITY_RESOLUTION = 5;

/**
 * Compute the full set of badge IDs a player currently qualifies for, derived
 * from their lifetime stats. The contract skips badges already held, so callers
 * can pass this whole list. Shared by the player voucher and the no-balance
 * sponsor mint.
 */
export async function computeEligibleBadgeIds(
  player: Address,
): Promise<bigint[]> {
  return eligibleFromStats(await computeBadgeStats(player));
}

/**
 * Lifetime stats behind the badges, for a player.
 *
 * Every figure spans the player's linked wallets, because a badge is an
 * achievement of the player and not of one address: `/api/users/:a/stats`,
 * the profile and the leaderboard have always counted that way, and
 * `getPlayerStreaks` below already did. The rest of this function did not,
 * and the gap was not theoretical. Measured on 4 Nov 2026 for the only player
 * with two wallets: 7,693 + 6,250 blocks, 76 + 67 runs and 417 + 251
 * conquests, so his profile showed 13,943 blocks and 143 runs while this
 * counted 7,693 and 76. Three badges he had earned were never offered to him:
 * dominion (10,000 blocks), veteran (100 runs) and conqueror (500 conquests).
 *
 * Held badges are already a union across the same wallets, so this makes the
 * two sides of the comparison agree.
 */
export async function computeBadgeStats(player: Address): Promise<BadgeStats> {
  const lower = player.toLowerCase();

  const linked = await addressesForPlayer(lower);

  const [
    ownedHexes,
    runCountRow,
    bestRunRow,
    bestDistRow,
    lifetimeRow,
    conquests,
    countryRows,
    streaks,
  ] = await Promise.all([
    db
      .select({ h3Id: hexes.h3Id })
      .from(hexes)
      .where(inArray(hexes.ownerAddress, linked)),
    db
      .select({ c: count() })
      .from(runs)
      .where(inArray(runs.userAddress, linked)),
    db
      .select({ hexesClaimed: runs.hexesClaimed })
      .from(runs)
      .where(inArray(runs.userAddress, linked))
      .orderBy(desc(runs.hexesClaimed))
      .limit(1),
    db
      .select({ distanceMeters: runs.distanceMeters })
      .from(runs)
      .where(inArray(runs.userAddress, linked))
      .orderBy(desc(runs.distanceMeters))
      .limit(1),
    db
      .select({ total: sql<number>`coalesce(sum(${runs.distanceMeters}), 0)` })
      .from(runs)
      .where(inArray(runs.userAddress, linked)),
    conquestsOf(linked),
    db
      .selectDistinct({ country: hexes.country })
      .from(hexes)
      .where(
        and(inArray(hexes.ownerAddress, linked), isNotNull(hexes.country)),
      ),
    getPlayerStreaks(lower),
  ]);

  const stats: BadgeStats = {
    totalRuns: runCountRow[0]?.c ?? 0,
    hexesOwned: ownedHexes.length,
    bestRunHexes: bestRunRow[0]?.hexesClaimed ?? 0,
    bestRunDistance: bestDistRow[0]?.distanceMeters ?? 0,
    lifetimeDistance: Number(lifetimeRow[0]?.total ?? 0),
    cityCount: new Set(
      ownedHexes.map((h) => cellToParent(h.h3Id, CITY_RESOLUTION)),
    ).size,
    conquests,
    countryCount: countryRows.length,
    // Streaks: consecutive days with at least one captured block. The best
    // streak ever counts, so a player who reached it but did not claim while it
    // was alive still gets the badge on their next claim.
    streak: streaks.best,
  };
  return stats;
}
