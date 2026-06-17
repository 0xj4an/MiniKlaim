import { type Address, type Hex, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { createLogger } from "@/lib/logger";

const log = createLogger("onchain:badgeVoucher");

const BADGES_ADDRESS = (process.env.NEXT_PUBLIC_MINIKLAIM_BADGES_ADDRESS ??
  "") as Address;
const SIGNER_PK = (process.env.SERVER_SIGNER_PRIVATE_KEY ?? "") as Hex;

function isConfigured(): boolean {
  return (
    BADGES_ADDRESS.length === 42 &&
    BADGES_ADDRESS.startsWith("0x") &&
    SIGNER_PK.length === 66 &&
    SIGNER_PK.startsWith("0x")
  );
}

// EIP-712 type matching MiniKlaimBadges.CLAIM_BADGES_TYPEHASH.
const CLAIM_BADGES_TYPES = {
  ClaimBadges: [
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
 * voucher for the same earned badges yields the same nonce, so the contract's
 * `usedNonces` mapping makes re-claims idempotent; earning a new badge changes
 * the set -> new nonce -> a fresh claimable voucher.
 */
export function badgeClaimNonce(player: Address, badgeIds: bigint[]): bigint {
  const key = `${player.toLowerCase()}:${sortIds(badgeIds)
    .map((b) => b.toString())
    .join(",")}`;
  return BigInt(keccak256(toBytes(key)));
}

export type BadgeVoucher = {
  badgeIds: string[]; // uint256 decimal strings, in the exact order signed
  nonce: string; // uint256 as decimal string
  signature: Hex;
  contract: Address;
  chainId: number;
};

export type SignBadgeVoucherResult =
  | { ok: true; voucher: BadgeVoucher }
  | { ok: false; reason: "not-configured" | "empty" | "error"; error?: string };

/**
 * Sign an EIP-712 voucher authorizing `player` to unlock `badgeIds` for
 * themselves in a single `claimBadges` tx. The signing key holds MINTER_ROLE on
 * the contract, which is what makes the voucher valid on-chain. The returned
 * `badgeIds` are in the exact order signed; the client must submit them verbatim.
 */
export async function signBadgeVoucher(
  player: Address,
  badgeIds: bigint[],
): Promise<SignBadgeVoucherResult> {
  if (!isConfigured()) {
    log.warn("signBadgeVoucher skipped: missing env config");
    return { ok: false, reason: "not-configured" };
  }
  if (badgeIds.length === 0) {
    return { ok: false, reason: "empty" };
  }
  try {
    const sorted = sortIds(badgeIds);
    const nonce = badgeClaimNonce(player, sorted);
    const account = privateKeyToAccount(SIGNER_PK);
    const signature = await account.signTypedData({
      domain: {
        name: "MiniKlaimBadges",
        version: "1",
        chainId: celo.id,
        verifyingContract: BADGES_ADDRESS,
      },
      types: CLAIM_BADGES_TYPES,
      primaryType: "ClaimBadges",
      message: { player, badgeIds: sorted, nonce },
    });
    log.info("badge voucher signed", { player, count: sorted.length });
    return {
      ok: true,
      voucher: {
        badgeIds: sorted.map((b) => b.toString()),
        nonce: nonce.toString(),
        signature,
        contract: BADGES_ADDRESS,
        chainId: celo.id,
      },
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log.error("signBadgeVoucher failed", {
      player,
      error: error.slice(0, 300),
    });
    return { ok: false, reason: "error", error };
  }
}
