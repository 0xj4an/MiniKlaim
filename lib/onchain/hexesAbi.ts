import type { Address } from "viem";
import {
  type ChainKey,
  DEFAULT_CHAIN_KEY,
  getChain,
  isChainConfigured,
} from "@/lib/onchain/chains";

/// Client-safe ABI fragment + address for the Hexes contract. No server key
/// imports, so this is safe to bundle into the browser for the player-submitted
/// `claimRun` flow.
export const HEXES_CLAIM_ABI = [
  {
    type: "function",
    name: "claimRun",
    stateMutability: "nonpayable",
    inputs: [
      { name: "h3Ids", type: "uint256[]" },
      { name: "nonce", type: "uint256" },
      { name: "sig", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

/// `mintTokens` (Hexes v2): the player turns recorded hexes into ERC-721 tokens,
/// gated by a backend voucher. Client-safe.
export const HEXES_MINT_TOKENS_ABI = [
  {
    type: "function",
    name: "mintTokens",
    stateMutability: "nonpayable",
    inputs: [
      { name: "h3Ids", type: "uint256[]" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "sig", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export function hexesAddress(
  chainKey: ChainKey = DEFAULT_CHAIN_KEY,
): Address | null {
  return isChainConfigured(chainKey) ? getChain(chainKey).hexesAddress : null;
}
