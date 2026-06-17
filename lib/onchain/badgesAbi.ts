import type { Address } from "viem";
import {
  type ChainKey,
  DEFAULT_CHAIN_KEY,
  getChain,
  isChainConfigured,
} from "@/lib/onchain/chains";

/// Client-safe ABI fragment + address for the Badges contract. No server key
/// imports, so this is safe to bundle into the browser for the player-submitted
/// `claimBadges` flow.
export const BADGES_CLAIM_ABI = [
  {
    type: "function",
    name: "claimBadges",
    stateMutability: "nonpayable",
    inputs: [
      { name: "badgeIds", type: "uint256[]" },
      { name: "nonce", type: "uint256" },
      { name: "sig", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export function badgesAddress(
  chainKey: ChainKey = DEFAULT_CHAIN_KEY,
): Address | null {
  return isChainConfigured(chainKey) ? getChain(chainKey).badgesAddress : null;
}
