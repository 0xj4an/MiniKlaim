import { createPublicClient, http } from "viem";
import {
  type ChainKey,
  getChain,
  isChainConfigured,
  SUPPORTED_CHAIN_KEYS,
} from "@/lib/onchain/chains";

// On-chain contract metrics, read per chain for the web dashboard. Server-only
// (RPC reads); no signer key involved.

const u256 = (name: string) =>
  ({
    type: "function",
    name,
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  }) as const;

const HEXES_METRICS_ABI = [
  u256("totalCaptures"),
  u256("totalClaimRuns"),
  u256("uniquePlayers"),
] as const;

const BADGES_METRICS_ABI = [
  u256("totalBadgesMinted"),
  u256("totalClaimTxns"),
  u256("uniqueHolders"),
] as const;

export type HexesMetrics = {
  captures: number;
  claimRuns: number;
  players: number;
};
export type BadgesMetrics = {
  minted: number;
  claimTxns: number;
  holders: number;
};

export type ChainMetrics = {
  key: ChainKey;
  label: string;
  chainId: number;
  explorerBase: string;
  hexesAddress: string | null;
  badgesAddress: string | null;
  hexes: HexesMetrics | null;
  badges: BadgesMetrics | null;
};

const LABELS: Record<ChainKey, string> = { celo: "Celo", soneium: "Soneium" };

export async function readChainMetrics(key: ChainKey): Promise<ChainMetrics> {
  const c = getChain(key);
  const base = {
    key,
    label: LABELS[key],
    chainId: c.chainId,
    explorerBase: c.explorerBase,
    hexesAddress: null as string | null,
    badgesAddress: null as string | null,
    hexes: null as HexesMetrics | null,
    badges: null as BadgesMetrics | null,
  };
  if (!isChainConfigured(key)) return base;

  const client = createPublicClient({ chain: c.chain, transport: http() });
  // viem 2.50.4 requires `authorizationList` in the read params type; undefined
  // satisfies it and is ignored at runtime (passing [] breaks the call).
  const read = (
    address: `0x${string}`,
    abi: typeof HEXES_METRICS_ABI | typeof BADGES_METRICS_ABI,
    functionName: string,
  ) =>
    client.readContract({
      address,
      abi,
      functionName,
      authorizationList: undefined,
    }) as Promise<bigint>;

  try {
    const [captures, claimRuns, players, minted, claimTxns, holders] =
      await Promise.all([
        read(c.hexesAddress, HEXES_METRICS_ABI, "totalCaptures"),
        read(c.hexesAddress, HEXES_METRICS_ABI, "totalClaimRuns"),
        read(c.hexesAddress, HEXES_METRICS_ABI, "uniquePlayers"),
        read(c.badgesAddress, BADGES_METRICS_ABI, "totalBadgesMinted"),
        read(c.badgesAddress, BADGES_METRICS_ABI, "totalClaimTxns"),
        read(c.badgesAddress, BADGES_METRICS_ABI, "uniqueHolders"),
      ]);
    return {
      ...base,
      hexesAddress: c.hexesAddress,
      badgesAddress: c.badgesAddress,
      hexes: {
        captures: Number(captures),
        claimRuns: Number(claimRuns),
        players: Number(players),
      },
      badges: {
        minted: Number(minted),
        claimTxns: Number(claimTxns),
        holders: Number(holders),
      },
    };
  } catch {
    return { ...base, hexesAddress: c.hexesAddress, badgesAddress: c.badgesAddress };
  }
}

export type DashboardMetrics = {
  chains: ChainMetrics[];
  totals: {
    captures: number;
    claimRuns: number;
    hexPlayers: number;
    badgesMinted: number;
    badgeClaimTxns: number;
    badgeHolders: number;
  };
};

export async function readAllMetrics(): Promise<DashboardMetrics> {
  const chains = await Promise.all(SUPPORTED_CHAIN_KEYS.map(readChainMetrics));
  const totals = chains.reduce(
    (acc, c) => ({
      captures: acc.captures + (c.hexes?.captures ?? 0),
      claimRuns: acc.claimRuns + (c.hexes?.claimRuns ?? 0),
      hexPlayers: acc.hexPlayers + (c.hexes?.players ?? 0),
      badgesMinted: acc.badgesMinted + (c.badges?.minted ?? 0),
      badgeClaimTxns: acc.badgeClaimTxns + (c.badges?.claimTxns ?? 0),
      badgeHolders: acc.badgeHolders + (c.badges?.holders ?? 0),
    }),
    {
      captures: 0,
      claimRuns: 0,
      hexPlayers: 0,
      badgesMinted: 0,
      badgeClaimTxns: 0,
      badgeHolders: 0,
    },
  );
  return { chains, totals };
}
