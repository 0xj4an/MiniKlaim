import { cellToParent } from "h3-js";
import { and, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { Address } from "viem";
import { db } from "@/lib/db";
import { hexes, runs, users } from "@/lib/db/schema";
import { BADGE_IDS } from "@/lib/onchain/badges";

// A "city" is an H3 resolution-5 cluster (~city scale), the same grouping the
// territory map uses. Distinct res-5 parents of a player's owned hexes.
const CITY_RESOLUTION = 5;

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

  const [ownedHexes, runCountRow, bestRunRow, bestDistRow, lifetimeRow, userRow, countryRows] =
    await Promise.all([
      db.select({ h3Id: hexes.h3Id }).from(hexes).where(eq(hexes.ownerAddress, lower)),
      db.select({ c: count() }).from(runs).where(eq(runs.userAddress, lower)),
      db
        .select({ hexesClaimed: runs.hexesClaimed })
        .from(runs)
        .where(eq(runs.userAddress, lower))
        .orderBy(desc(runs.hexesClaimed))
        .limit(1),
      db
        .select({ distanceMeters: runs.distanceMeters })
        .from(runs)
        .where(eq(runs.userAddress, lower))
        .orderBy(desc(runs.distanceMeters))
        .limit(1),
      db
        .select({ total: sql<number>`coalesce(sum(${runs.distanceMeters}), 0)` })
        .from(runs)
        .where(eq(runs.userAddress, lower)),
      db.select({ conquests: users.conquests }).from(users).where(eq(users.address, lower)),
      db
        .selectDistinct({ country: hexes.country })
        .from(hexes)
        .where(and(eq(hexes.ownerAddress, lower), isNotNull(hexes.country))),
    ]);

  const hexesOwned = ownedHexes.length;
  const totalRuns = runCountRow[0]?.c ?? 0;
  const bestRunHexes = bestRunRow[0]?.hexesClaimed ?? 0;
  const bestRunDistance = bestDistRow[0]?.distanceMeters ?? 0;
  const lifetimeDistance = Number(lifetimeRow[0]?.total ?? 0);
  const conquests = userRow[0]?.conquests ?? 0;
  const countryCount = countryRows.length;
  const cityCount = new Set(
    ownedHexes.map((h) => cellToParent(h.h3Id, CITY_RESOLUTION)),
  ).size;

  const candidates: bigint[] = [];
  // Runs.
  if (totalRuns >= 1) candidates.push(BADGE_IDS.firstSteps);
  if (totalRuns >= 50) candidates.push(BADGE_IDS.iron);
  if (totalRuns >= 100) candidates.push(BADGE_IDS.veteran);
  if (totalRuns >= 250) candidates.push(BADGE_IDS.relentless);
  // Territory owned.
  if (hexesOwned >= 1) candidates.push(BADGE_IDS.firstBlock);
  if (hexesOwned >= 5) candidates.push(BADGE_IDS.fiveBlocks);
  if (hexesOwned >= 20) candidates.push(BADGE_IDS.mayor);
  if (hexesOwned >= 100) candidates.push(BADGE_IDS.hundred);
  if (hexesOwned >= 250) candidates.push(BADGE_IDS.baron);
  if (hexesOwned >= 500) candidates.push(BADGE_IDS.duke);
  if (hexesOwned >= 1000) candidates.push(BADGE_IDS.kingdom);
  // Single-run feats.
  if (bestRunHexes >= 5) candidates.push(BADGE_IDS.bigRun);
  if (bestRunDistance >= 10000) candidates.push(BADGE_IDS.marathon);
  if (bestRunDistance >= 21000) candidates.push(BADGE_IDS.halfMarathon);
  if (bestRunDistance >= 42000) candidates.push(BADGE_IDS.fullMarathon);
  // Lifetime distance.
  if (lifetimeDistance >= 50000) candidates.push(BADGE_IDS.pacer);
  if (lifetimeDistance >= 100000) candidates.push(BADGE_IDS.roadrunner);
  if (lifetimeDistance >= 500000) candidates.push(BADGE_IDS.ultra);
  // Exploration.
  if (cityCount >= 1) candidates.push(BADGE_IDS.firstCity);
  if (cityCount >= 3) candidates.push(BADGE_IDS.explorer);
  if (cityCount >= 10) candidates.push(BADGE_IDS.wanderer);
  if (cityCount >= 25) candidates.push(BADGE_IDS.pioneer);
  // Conquest.
  if (conquests >= 1) candidates.push(BADGE_IDS.firstBlood);
  if (conquests >= 25) candidates.push(BADGE_IDS.raider);
  if (conquests >= 100) candidates.push(BADGE_IDS.warlord);
  // Countries.
  if (countryCount >= 1) candidates.push(BADGE_IDS.firstCountry);
  if (countryCount >= 2) candidates.push(BADGE_IDS.borderCrosser);
  if (countryCount >= 5) candidates.push(BADGE_IDS.globetrotter);
  if (countryCount >= 10) candidates.push(BADGE_IDS.worldCitizen);
  if (countryCount >= 25) candidates.push(BADGE_IDS.continental);
  if (countryCount >= 50) candidates.push(BADGE_IDS.planetary);
  if (countryCount >= 100) candidates.push(BADGE_IDS.hemispheric);
  if (countryCount >= 195) candidates.push(BADGE_IDS.worldwide);
  // Legendary tier.
  if (hexesOwned >= 2500) candidates.push(BADGE_IDS.empire);
  if (hexesOwned >= 10000) candidates.push(BADGE_IDS.dominion);
  if (lifetimeDistance >= 1_000_000) candidates.push(BADGE_IDS.ironLegs);
  if (lifetimeDistance >= 5_000_000) candidates.push(BADGE_IDS.earthstrider);
  if (lifetimeDistance >= 40_000_000) candidates.push(BADGE_IDS.equator);
  if (totalRuns >= 500) candidates.push(BADGE_IDS.machine);
  if (totalRuns >= 1000) candidates.push(BADGE_IDS.legend);
  if (cityCount >= 50) candidates.push(BADGE_IDS.cartographer);
  if (cityCount >= 100) candidates.push(BADGE_IDS.atlas);
  if (cityCount >= 250) candidates.push(BADGE_IDS.voyager);
  if (cityCount >= 500) candidates.push(BADGE_IDS.odyssey);
  if (cityCount >= 1000) candidates.push(BADGE_IDS.worldwalker);
  if (conquests >= 500) candidates.push(BADGE_IDS.conqueror);
  if (conquests >= 1000) candidates.push(BADGE_IDS.overlord);

  return candidates;
}
