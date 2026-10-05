import type { Address, Chain } from "viem";
import { celo, celoSepolia, soneium } from "viem/chains";
import { TOKENS, type TokenSymbol } from "@/lib/tokens";

// Generic multichain registry. Adding a chain = one entry here + a deploy of
// Hexes/Badges + the NEXT_PUBLIC_<KEY>_*_ADDRESS env vars. Everything onchain
// (signing, relayer, reads, client tx) is parameterized by ChainKey.
//
// Client-safe: only public env + viem chain objects, no signer key.

export type ChainKey = "celo" | "celoSepolia" | "soneium";

/**
 * A stablecoin the client can offer as `feeCurrency` on Celo (CIP-64). Order
 * in `ChainConfig.feeCurrencies` is preference: USDT first, then the
 * others. USDm's `adapter` equals the token address; USDC/USDT need the
 * dedicated Mento adapter.
 */
export type FeeCurrency = {
  symbol: TokenSymbol;
  token: Address;
  adapter: Address;
};

export type ChainConfig = {
  key: ChainKey;
  chain: Chain;
  chainId: number;
  hexesAddress: Address;
  badgesAddress: Address;
  /**
   * MiniKlaimRewards contract address. Optional: only Celo mainnet ships the
   * rewards MVP; other chains leave this empty. Backend + UI guard on this
   * being non-zero before offering the claim flow.
   */
  rewardsAddress: Address;
  /**
   * MiniKlaimClaimRouter address. Optional: when set, a finished run settles
   * hexes and badges in one tx (one wallet approval). When zero the client
   * falls back to the two-tx `claimRun` + `claimBadges` path, so the app works
   * before and after the router is deployed on a given chain.
   */
  claimRouterAddress: Address;
  /**
   * Fee-currency adapters for paying gas in a stablecoin (Celo CIP-64).
   * Ordered by preference: the client picks the first one for which the user
   * has a positive balance. Empty on chains without fee abstraction (gas paid
   * natively / by the host).
   */
  feeCurrencies: FeeCurrency[];
  /**
   * Destination address for the link-flow "prove wallet ownership" tx. Client
   * sends a 0-value tx with `keccak256(code)` as calldata; backend reads the
   * receipt to derive the redeemer. Set to the relayer EOA by default.
   */
  linkVerifier: Address;
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

const LINK_VERIFIER = addr(process.env.NEXT_PUBLIC_LINK_VERIFIER_ADDRESS);

// Celo CIP-64 fee-currency adapters. USDT is the primary fee token (what
// MiniPay wallets actually hold). USDC, then USDm, are the fallback when
// USDT is missing or too small to cover the network fee. USDC/USDT need
// Mento's adapter; USDm is self-adapting.
const CELO_FEE_CURRENCIES: FeeCurrency[] = [
  {
    symbol: "USDT",
    token: TOKENS.USDT.address,
    adapter: TOKENS.USDT.feeAdapter,
  },
  {
    symbol: "USDC",
    token: TOKENS.USDC.address,
    adapter: TOKENS.USDC.feeAdapter,
  },
  {
    symbol: "USDm",
    token: TOKENS.USDm.address,
    adapter: TOKENS.USDm.feeAdapter,
  },
];

export const CHAINS: Record<ChainKey, ChainConfig> = {
  celo: {
    key: "celo",
    chain: celo,
    chainId: celo.id,
    hexesAddress: addr(process.env.NEXT_PUBLIC_CELO_HEXES_ADDRESS),
    badgesAddress: addr(process.env.NEXT_PUBLIC_CELO_BADGES_ADDRESS),
    rewardsAddress: addr(process.env.NEXT_PUBLIC_CELO_REWARDS_ADDRESS),
    claimRouterAddress: addr(process.env.NEXT_PUBLIC_CELO_CLAIM_ROUTER_ADDRESS),
    feeCurrencies: CELO_FEE_CURRENCIES,
    linkVerifier: LINK_VERIFIER,
    explorerBase: "https://celoscan.io",
  },
  celoSepolia: {
    key: "celoSepolia",
    chain: celoSepolia,
    chainId: celoSepolia.id,
    hexesAddress: addr(process.env.NEXT_PUBLIC_CELO_SEPOLIA_HEXES_ADDRESS),
    badgesAddress: addr(process.env.NEXT_PUBLIC_CELO_SEPOLIA_BADGES_ADDRESS),
    rewardsAddress: addr(process.env.NEXT_PUBLIC_CELO_SEPOLIA_REWARDS_ADDRESS),
    claimRouterAddress: addr(
      process.env.NEXT_PUBLIC_CELO_SEPOLIA_CLAIM_ROUTER_ADDRESS,
    ),
    // Testnet also supports CIP-64 fee abstraction but the adapter set is
    // different. Leave empty until testnet Mento adapters are wired.
    feeCurrencies: [],
    linkVerifier: LINK_VERIFIER,
    explorerBase: "https://celo-sepolia.blockscout.com",
  },
  soneium: {
    key: "soneium",
    chain: soneium,
    chainId: soneium.id,
    hexesAddress: addr(process.env.NEXT_PUBLIC_SONEIUM_HEXES_ADDRESS),
    badgesAddress: addr(process.env.NEXT_PUBLIC_SONEIUM_BADGES_ADDRESS),
    // Rewards MVP is Celo-only.
    rewardsAddress: ZERO,
    claimRouterAddress: addr(
      process.env.NEXT_PUBLIC_SONEIUM_CLAIM_ROUTER_ADDRESS,
    ),
    feeCurrencies: [],
    linkVerifier: LINK_VERIFIER,
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

/**
 * Whether this chain can settle a run in one transaction. False until the
 * router is deployed and its address is set, which is what gates the combined
 * claim flow on and off.
 */
export function isClaimRouterConfigured(key: ChainKey): boolean {
  return isChainConfigured(key) && CHAINS[key].claimRouterAddress !== ZERO;
}

/**
 * Stablecoins the player actually holds, in preference order. USDT comes
 * first. Callers that can retry a rejected fee walk this list; everyone
 * else uses the first entry via `pickFeeAdapter`.
 */
export function heldFeeAdapters(
  feeCurrencies: FeeCurrency[],
  balances: Partial<Record<TokenSymbol, { value: bigint } | null>>,
): FeeCurrency[] {
  return feeCurrencies.filter((fc) => {
    const bal = balances[fc.symbol];
    return !!bal && bal.value > 0n;
  });
}

/**
 * First held fee-currency adapter. Undefined when no stablecoin is held or
 * the chain has no fee abstraction, so the caller omits `feeCurrency`.
 */
export function pickFeeAdapter(
  feeCurrencies: FeeCurrency[],
  balances: Partial<Record<TokenSymbol, { value: bigint } | null>>,
): Address | undefined {
  return heldFeeAdapters(feeCurrencies, balances)[0]?.adapter;
}
