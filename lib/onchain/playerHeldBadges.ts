import type { Address } from "viem";
import { addressesForPlayer } from "@/lib/players";
import { onchainBadgeIdsHeld } from "@/lib/onchain/badges";
import { type ChainKey, DEFAULT_CHAIN_KEY } from "@/lib/onchain/chains";

/**
 * Badges this player already holds on any linked wallet, on this chain.
 * The finish card and the claim voucher have to use this set. Checking only
 * the connected address offers badges the player already has on another
 * wallet, which is what MiniPay shows again after a cache clear.
 */
export async function badgeIdsHeldByPlayer(
  address: string,
  chainKey: ChainKey = DEFAULT_CHAIN_KEY,
): Promise<number[]> {
  const linked = await addressesForPlayer(address);
  const lists = await Promise.all(
    linked.map((wallet) => onchainBadgeIdsHeld(wallet as Address, chainKey)),
  );
  return Array.from(new Set(lists.flat())).sort((a, b) => a - b);
}
