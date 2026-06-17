"use client";

import { useChainId } from "wagmi";
import {
  type ChainConfig,
  type ChainKey,
  chainKeyById,
  DEFAULT_CHAIN_KEY,
  getChain,
} from "@/lib/onchain/chains";

/**
 * The chain the player is currently on, derived from the connected wallet.
 * MiniPay/Farcaster -> Celo; Startale -> Soneium. There is no in-app chain
 * switching, so this is fixed by the host environment.
 */
export function useActiveChainKey(): ChainKey {
  const chainId = useChainId();
  return chainKeyById(chainId) ?? DEFAULT_CHAIN_KEY;
}

export function useActiveChain(): ChainConfig {
  return getChain(useActiveChainKey());
}
