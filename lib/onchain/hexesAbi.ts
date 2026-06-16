import type { Address } from "viem";

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

export function hexesAddress(): Address | null {
  const addr = process.env.NEXT_PUBLIC_MINIKLAIM_HEXES_ADDRESS ?? "";
  return addr.length === 42 && addr.startsWith("0x") ? (addr as Address) : null;
}
