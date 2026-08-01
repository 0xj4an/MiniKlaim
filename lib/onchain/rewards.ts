import { createPublicClient, http, type Address } from "viem";
import { erc20Abi } from "viem";
import {
  type ChainKey,
  DEFAULT_CHAIN_KEY,
  getChain,
} from "@/lib/onchain/chains";
import { REWARDS_ABI } from "@/lib/onchain/rewardsAbi";
import { createLogger } from "@/lib/logger";

const log = createLogger("onchain:rewards");

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export function isRewardsConfigured(
  chainKey: ChainKey = DEFAULT_CHAIN_KEY,
): boolean {
  return getChain(chainKey).rewardsAddress !== ZERO;
}

export function rewardsContractAddress(
  chainKey: ChainKey = DEFAULT_CHAIN_KEY,
): Address | null {
  const c = getChain(chainKey);
  return c.rewardsAddress !== ZERO ? c.rewardsAddress : null;
}

function publicClient(chainKey: ChainKey) {
  return createPublicClient({
    chain: getChain(chainKey).chain,
    transport: http(),
  });
}

/**
 * Which of `badgeIds` the player has already claimed on-chain. Returns the
 * set as a Set<number> for O(1) subtraction on the caller side.
 */
export async function readClaimedBadgeIds(
  player: Address,
  badgeIds: bigint[],
  chainKey: ChainKey = DEFAULT_CHAIN_KEY,
): Promise<Set<number>> {
  const addr = rewardsContractAddress(chainKey);
  if (!addr || badgeIds.length === 0) return new Set();
  try {
    const client = publicClient(chainKey);
    const results = await client.multicall({
      contracts: badgeIds.map(
        (id) =>
          ({
            address: addr,
            abi: REWARDS_ABI,
            functionName: "claimed",
            args: [player, id],
          }) as const,
      ),
      allowFailure: true,
      // Same viem 2.x type quirk as onchainBadgeIdsHeld in badges.ts: the
      // Record type requires this param but passing `[]` at runtime breaks
      // the RPC. `undefined` satisfies both.
      authorizationList: undefined,
    });
    const out = new Set<number>();
    results.forEach((r, i) => {
      if (r.status === "success" && r.result === true) {
        out.add(Number(badgeIds[i]));
      }
    });
    return out;
  } catch (e) {
    log.warn("readClaimedBadgeIds failed", {
      player,
      chainKey,
      error: e instanceof Error ? e.message : String(e),
    });
    return new Set();
  }
}

/**
 * Per-badge configured reward amount in wei. Returns 0n for badges the admin
 * hasn't priced yet (contract treats those as un-earnable).
 */
export async function readRewardAmounts(
  badgeIds: bigint[],
  chainKey: ChainKey = DEFAULT_CHAIN_KEY,
): Promise<Map<number, bigint>> {
  const addr = rewardsContractAddress(chainKey);
  if (!addr || badgeIds.length === 0) return new Map();
  try {
    const client = publicClient(chainKey);
    const results = await client.multicall({
      contracts: badgeIds.map(
        (id) =>
          ({
            address: addr,
            abi: REWARDS_ABI,
            functionName: "rewardAmount",
            args: [id],
          }) as const,
      ),
      allowFailure: true,
      // Same viem 2.x type quirk as onchainBadgeIdsHeld in badges.ts: the
      // Record type requires this param but passing `[]` at runtime breaks
      // the RPC. `undefined` satisfies both.
      authorizationList: undefined,
    });
    const out = new Map<number, bigint>();
    results.forEach((r, i) => {
      if (r.status === "success") {
        out.set(Number(badgeIds[i]), r.result as bigint);
      }
    });
    return out;
  } catch (e) {
    log.warn("readRewardAmounts failed", {
      chainKey,
      error: e instanceof Error ? e.message : String(e),
    });
    return new Map();
  }
}

/** Current USDm balance held by the rewards contract. */
export async function readRewardsPoolBalance(
  chainKey: ChainKey = DEFAULT_CHAIN_KEY,
): Promise<bigint> {
  const addr = rewardsContractAddress(chainKey);
  if (!addr) return 0n;
  try {
    const client = publicClient(chainKey);
    const token = (await client.readContract({
      address: addr,
      abi: REWARDS_ABI,
      functionName: "rewardToken",
      authorizationList: undefined,
    })) as Address;
    const bal = (await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [addr],
      authorizationList: undefined,
    })) as bigint;
    return bal;
  } catch (e) {
    log.warn("readRewardsPoolBalance failed", {
      chainKey,
      error: e instanceof Error ? e.message : String(e),
    });
    return 0n;
  }
}
