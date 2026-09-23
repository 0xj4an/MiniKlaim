import type { Address } from "viem";
import {
  type ChainKey,
  DEFAULT_CHAIN_KEY,
  getChain,
  isClaimRouterConfigured,
} from "@/lib/onchain/chains";

/// Client-safe ABI fragment + address for MiniKlaimClaimRouter. No server key
/// imports, so this is safe to bundle into the browser for the combined
/// single-approval claim flow.
export const CLAIM_ROUTER_ABI = [
  {
    type: "function",
    name: "claimAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "h3Ids", type: "uint256[]" },
      { name: "badgeIds", type: "uint256[]" },
      { name: "nonce", type: "uint256" },
      { name: "sig", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

/** Null until the router is deployed on this chain, which gates the flow. */
export function claimRouterAddress(
  chainKey: ChainKey = DEFAULT_CHAIN_KEY,
): Address | null {
  return isClaimRouterConfigured(chainKey)
    ? getChain(chainKey).claimRouterAddress
    : null;
}
