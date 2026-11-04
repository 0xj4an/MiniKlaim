import type { Address } from "viem";
import type { ChainKey } from "@/lib/onchain/chains";
import { computeEligibleBadgeIds } from "@/lib/onchain/badgeEligibility";
import { withoutHeld } from "@/lib/onchain/badgeSet";
import { badgeIdsHeldByPlayer } from "@/lib/onchain/playerHeldBadges";

/**
 * Badges a player has earned and does not already hold. Both the player's own
 * voucher and the sponsored mint read this, so the number the wallet asks the
 * player to confirm is the number the screen offered. See lib/onchain/badgeSet
 * for why that needed saying.
 */
export async function claimableBadgeIds(
  player: Address,
  chainKey: ChainKey,
): Promise<bigint[]> {
  const [eligible, held] = await Promise.all([
    computeEligibleBadgeIds(player),
    badgeIdsHeldByPlayer(player.toLowerCase(), chainKey),
  ]);
  return withoutHeld(eligible, held);
}
