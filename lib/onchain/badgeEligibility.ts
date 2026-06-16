import { count, desc, eq } from "drizzle-orm";
import type { Address } from "viem";
import { db } from "@/lib/db";
import { hexes, runs } from "@/lib/db/schema";
import { BADGE_IDS } from "@/lib/onchain/badges";

/**
 * Compute the full set of badge IDs a player currently qualifies for, derived
 * from their lifetime stats. The contract skips badges already held, so callers
 * can pass this whole list. Shared by the voucher endpoint (player-claim) and
 * the sponsor-mint fallback.
 *
 * Streak badges (3/7/14 day) are intentionally omitted; they need a separate
 * day-streak query and will land in a follow-up.
 */
export async function computeEligibleBadgeIds(
  player: Address,
): Promise<bigint[]> {
  const lower = player.toLowerCase();

  const [hexCountRow] = await db
    .select({ c: count() })
    .from(hexes)
    .where(eq(hexes.ownerAddress, lower));
  const [runCountRow] = await db
    .select({ c: count() })
    .from(runs)
    .where(eq(runs.userAddress, lower));
  const [bestRunRow] = await db
    .select({ hexesClaimed: runs.hexesClaimed })
    .from(runs)
    .where(eq(runs.userAddress, lower))
    .orderBy(desc(runs.hexesClaimed))
    .limit(1);
  const [bestDistRow] = await db
    .select({ distanceMeters: runs.distanceMeters })
    .from(runs)
    .where(eq(runs.userAddress, lower))
    .orderBy(desc(runs.distanceMeters))
    .limit(1);

  const hexesOwned = hexCountRow?.c ?? 0;
  const totalRuns = runCountRow?.c ?? 0;
  const bestRunHexes = bestRunRow?.hexesClaimed ?? 0;
  const bestRunDistance = bestDistRow?.distanceMeters ?? 0;

  const candidates: bigint[] = [];
  if (totalRuns >= 1) candidates.push(BADGE_IDS.firstSteps);
  if (hexesOwned >= 5) candidates.push(BADGE_IDS.fiveBlocks);
  if (hexesOwned >= 20) candidates.push(BADGE_IDS.mayor);
  if (hexesOwned >= 100) candidates.push(BADGE_IDS.hundred);
  if (bestRunHexes >= 5) candidates.push(BADGE_IDS.bigRun);
  if (bestRunDistance >= 10000) candidates.push(BADGE_IDS.marathon);
  if (totalRuns >= 50) candidates.push(BADGE_IDS.iron);

  return candidates;
}
