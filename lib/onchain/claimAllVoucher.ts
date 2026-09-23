import { type Address, type Hex, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  type ChainKey,
  DEFAULT_CHAIN_KEY,
  getChain,
  isClaimRouterConfigured,
} from "@/lib/onchain/chains";
import { createLogger } from "@/lib/logger";
import { h3ToTokenId } from "@/lib/onchain/hexes";

const log = createLogger("onchain:claimAllVoucher");

const SIGNER_PK = (process.env.SERVER_SIGNER_PRIVATE_KEY ?? "") as Hex;

function signerConfigured(): boolean {
  return SIGNER_PK.length === 66 && SIGNER_PK.startsWith("0x");
}

// EIP-712 type matching MiniKlaimClaimRouter.CLAIM_ALL_TYPEHASH.
const CLAIM_ALL_TYPES = {
  ClaimAll: [
    { name: "player", type: "address" },
    { name: "h3Ids", type: "uint256[]" },
    { name: "badgeIds", type: "uint256[]" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

function sortIds(ids: bigint[]): bigint[] {
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Deterministic single-use nonce for a combined claim, bound to the run and the
 * badge set. Re-requesting a voucher for the same run and badges yields the same
 * nonce, so the router's `usedNonces` mapping makes re-submission idempotent;
 * earning another badge changes the set, hence the nonce, hence a fresh voucher.
 *
 * The run id is length-prefixed so a run id containing the separator cannot
 * collide with a different (run, badges) pair.
 */
export function claimAllNonce(runId: string, badgeIds: bigint[]): bigint {
  const ids = sortIds(badgeIds)
    .map((b) => b.toString())
    .join(",");
  return BigInt(keccak256(toBytes(`${runId.length}:${runId}:${ids}`)));
}

export type ClaimAllVoucher = {
  h3Ids: string[]; // uint256 decimal strings, in the exact order signed
  badgeIds: string[]; // uint256 decimal strings, in the exact order signed
  nonce: string; // uint256 as decimal string
  signature: Hex;
  contract: Address;
  chainId: number;
};

export type SignClaimAllResult =
  | { ok: true; voucher: ClaimAllVoucher }
  | { ok: false; reason: "not-configured" | "empty" | "error"; error?: string };

/**
 * Sign one EIP-712 voucher authorizing `player` to settle a whole run through
 * MiniKlaimClaimRouter: capture `h3Ids` (h3 hex strings) and unlock `badgeIds`,
 * in a single `claimAll` tx. The signing key holds VOUCHER_SIGNER_ROLE on the
 * router. The returned arrays are in the exact order signed; the client must
 * submit them verbatim. Either array may be empty, but not both.
 *
 * The EIP-712 domain binds chainId + the router address, so a voucher cannot be
 * replayed on another chain or against another router deployment.
 */
export async function signClaimAllVoucher(
  player: Address,
  h3Ids: string[],
  badgeIds: bigint[],
  runId: string,
  chainKey: ChainKey = DEFAULT_CHAIN_KEY,
): Promise<SignClaimAllResult> {
  if (!signerConfigured() || !isClaimRouterConfigured(chainKey)) {
    log.warn("signClaimAllVoucher skipped: missing config", { chainKey });
    return { ok: false, reason: "not-configured" };
  }
  if (h3Ids.length === 0 && badgeIds.length === 0) {
    return { ok: false, reason: "empty" };
  }
  const { claimRouterAddress, chainId } = getChain(chainKey);
  try {
    const tokenIds = h3Ids.map(h3ToTokenId);
    const sortedBadges = sortIds(badgeIds);
    const nonce = claimAllNonce(runId, sortedBadges);
    const account = privateKeyToAccount(SIGNER_PK);
    const signature = await account.signTypedData({
      domain: {
        name: "MiniKlaimClaimRouter",
        version: "1",
        chainId,
        verifyingContract: claimRouterAddress,
      },
      types: CLAIM_ALL_TYPES,
      primaryType: "ClaimAll",
      message: {
        player,
        h3Ids: tokenIds,
        badgeIds: sortedBadges,
        nonce,
      },
    });
    log.info("claimAll voucher signed", {
      player,
      hexCount: tokenIds.length,
      badgeCount: sortedBadges.length,
      chainKey,
    });
    return {
      ok: true,
      voucher: {
        h3Ids: tokenIds.map((t) => t.toString()),
        badgeIds: sortedBadges.map((b) => b.toString()),
        nonce: nonce.toString(),
        signature,
        contract: claimRouterAddress,
        chainId,
      },
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log.error("signClaimAllVoucher failed", {
      player,
      error: error.slice(0, 300),
    });
    return { ok: false, reason: "error", error };
  }
}
