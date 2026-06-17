import type { Address, Chain } from "viem";
import { celo, soneium } from "viem/chains";

// Generic multichain registry. Adding a chain = one entry here + a deploy of
// Hexes/Badges + the NEXT_PUBLIC_<KEY>_*_ADDRESS env vars. Everything onchain
// (signing, relayer, reads, client tx) is parameterized by ChainKey.
//
// Client-safe: only public env + viem chain objects, no signer key.

export type ChainKey = "celo" | "soneium";

export type ChainConfig = {
  key: ChainKey;
  chain: Chain;
  chainId: number;
  hexesAddress: Address;
  badgesAddress: Address;
  /**
   * Fee-currency adapter for paying gas in a stablecoin (Celo CIP-64). When set,
   * the client may pass it as `feeCurrency` if the player holds that token.
   * Undefined on chains without fee abstraction (gas paid natively / by the host).
   */
  feeCurrency?: Address;
  /** Base URL for explorer links (no trailing slash). */
  explorerBase: string;
};

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

function addr(...candidates: (string | undefined)[]): Address {
  for (const c of candidates) {
    const v = (c ?? "").trim();
    if (v.length === 42 && v.startsWith("0x")) return v as Address;
  }
  return ZERO;
}

export const CHAINS: Record<ChainKey, ChainConfig> = {
  celo: {
    key: "celo",
    chain: celo,
    chainId: celo.id,
    // Back-compat: fall back to the legacy single-chain env vars.
    hexesAddress: addr(
      process.env.NEXT_PUBLIC_CELO_HEXES_ADDRESS,
      process.env.NEXT_PUBLIC_MINIKLAIM_HEXES_ADDRESS,
    ),
    badgesAddress: addr(
      process.env.NEXT_PUBLIC_CELO_BADGES_ADDRESS,
      process.env.NEXT_PUBLIC_MINIKLAIM_BADGES_ADDRESS,
    ),
    // USDm adapter (CIP-64). Source: celopedia minipay-guide.
    feeCurrency: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
    explorerBase: "https://celoscan.io",
  },
  soneium: {
    key: "soneium",
    chain: soneium,
    chainId: soneium.id,
    hexesAddress: addr(process.env.NEXT_PUBLIC_SONEIUM_HEXES_ADDRESS),
    badgesAddress: addr(process.env.NEXT_PUBLIC_SONEIUM_BADGES_ADDRESS),
    feeCurrency: undefined,
    explorerBase: "https://soneium.blockscout.com",
  },
};

export const DEFAULT_CHAIN_KEY: ChainKey = "celo";
export const SUPPORTED_CHAIN_KEYS = Object.keys(CHAINS) as ChainKey[];

export function getChain(key: ChainKey): ChainConfig {
  return CHAINS[key];
}

export function chainKeyById(id: number): ChainKey | undefined {
  return SUPPORTED_CHAIN_KEYS.find((k) => CHAINS[k].chainId === id);
}

/** Coerce an arbitrary string (query param, header) to a known ChainKey. */
export function parseChainKey(value: string | null | undefined): ChainKey {
  return value && (SUPPORTED_CHAIN_KEYS as string[]).includes(value)
    ? (value as ChainKey)
    : DEFAULT_CHAIN_KEY;
}

export function isChainConfigured(key: ChainKey): boolean {
  const c = CHAINS[key];
  return c.hexesAddress !== ZERO && c.badgesAddress !== ZERO;
}
