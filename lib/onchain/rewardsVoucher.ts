import { type Address, type Hex, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  type ChainKey,
  DEFAULT_CHAIN_KEY,
  getChain,
} from "@/lib/onchain/chains";
import { isRewardsConfigured } from "@/lib/onchain/rewards";
import { createLogger } from "@/lib/logger";

const log = createLogger("onchain:rewardsVoucher");

const SIGNER_PK = (process.env.SERVER_SIGNER_PRIVATE_KEY ?? "") as Hex;

function signerConfigured(): boolean {
  return SIGNER_PK.length === 66 && SIGNER_PK.startsWith("0x");
}

// EIP-712 type matching MiniKlaimRewards CLAIM_REWARDS_TYPEHASH.
const CLAIM_REWARDS_TYPES = {
  ClaimRewards: [
    { name: "player", type: "address" },
    { name: "badgeIds", type: "uint256[]" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

function sortIds(badgeIds: bigint[]): bigint[] {
  return [...badgeIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Deterministic single-use nonce bound to (player, badge set). Re-requesting a
 * voucher for the same unclaimed set yields the same nonce; a new unclaimed
 * badge changes the set, so the previous voucher becomes stale and a fresh
 * one is issued.
 */
export function rewardsClaimNonce(
  player: Address,
  badgeIds: bigint[],
): bigint {
  const key = `rewards:${player.toLowerCase()}:${sortIds(badgeIds)
    .map((b) => b.toString())
    .join(",")}`;
  return BigInt(keccak256(toBytes(key)));
}

export type RewardsVoucher = {
  badgeIds: string[];
  nonce: string;
  signature: Hex;
  contract: Address;
  chainId: number;
};

export type SignRewardsVoucherResult =
  | { ok: true; voucher: RewardsVoucher }
  | {
      ok: false;
      reason: "not-configured" | "empty" | "error";
      error?: string;
    };

/**
 * Sign an EIP-712 voucher authorizing `player` to claim USDm rewards for
 * `badgeIds` in a single `claimRewards` tx on `chainKey`. Signing key must
 * hold `REWARDER_ROLE` on the rewards contract.
 */
export async function signRewardsVoucher(
  player: Address,
  badgeIds: bigint[],
  chainKey: ChainKey = DEFAULT_CHAIN_KEY,
): Promise<SignRewardsVoucherResult> {
  if (!signerConfigured() || !isRewardsConfigured(chainKey)) {
    log.warn("signRewardsVoucher skipped: missing config", { chainKey });
    return { ok: false, reason: "not-configured" };
  }
  if (badgeIds.length === 0) {
    return { ok: false, reason: "empty" };
  }
  const { rewardsAddress, chainId } = getChain(chainKey);
  try {
    const sorted = sortIds(badgeIds);
    const nonce = rewardsClaimNonce(player, sorted);
    const account = privateKeyToAccount(SIGNER_PK);
    const signature = await account.signTypedData({
      domain: {
        name: "MiniKlaimRewards",
        version: "1",
        chainId,
        verifyingContract: rewardsAddress,
      },
      types: CLAIM_REWARDS_TYPES,
      primaryType: "ClaimRewards",
      message: { player, badgeIds: sorted, nonce },
    });
    log.info("rewards voucher signed", {
      player,
      count: sorted.length,
      chainKey,
    });
    return {
      ok: true,
      voucher: {
        badgeIds: sorted.map((b) => b.toString()),
        nonce: nonce.toString(),
        signature,
        contract: rewardsAddress,
        chainId,
      },
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log.error("signRewardsVoucher failed", {
      player,
      error: error.slice(0, 300),
    });
    return { ok: false, reason: "error", error };
  }
}
