import { type Address, type Hex, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  type ChainKey,
  DEFAULT_CHAIN_KEY,
  getChain,
  isChainConfigured,
} from "@/lib/onchain/chains";
import { createLogger } from "@/lib/logger";
import { h3ToTokenId } from "@/lib/onchain/hexes";

const log = createLogger("onchain:voucher");

const SIGNER_PK = (process.env.SERVER_SIGNER_PRIVATE_KEY ?? "") as Hex;

function signerConfigured(): boolean {
  return SIGNER_PK.length === 66 && SIGNER_PK.startsWith("0x");
}

// EIP-712 type matching MiniKlaimHexes.CLAIM_RUN_TYPEHASH.
const CLAIM_RUN_TYPES = {
  ClaimRun: [
    { name: "player", type: "address" },
    { name: "h3Ids", type: "uint256[]" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

/**
 * Deterministic single-use nonce for a run. The same runId always yields the
 * same nonce, so re-requesting a voucher is idempotent; the contract's
 * `usedNonces` mapping enforces single redemption on-chain.
 */
export function runIdToNonce(runId: string): bigint {
  return BigInt(keccak256(toBytes(runId)));
}

export type ClaimVoucher = {
  tokenIds: string[]; // uint256 as decimal strings (JSON-safe)
  nonce: string; // uint256 as decimal string
  signature: Hex;
  contract: Address;
  chainId: number;
};

export type SignVoucherResult =
  | { ok: true; voucher: ClaimVoucher }
  | { ok: false; reason: "not-configured" | "empty" | "error"; error?: string };

/**
 * Sign an EIP-712 voucher authorizing `player` to capture `h3Ids` (h3 hex
 * strings) in a single `claimRun` tx on `chainKey`. The signing key holds
 * CAPTURER_ROLE on that chain's Hexes contract, which is what makes the voucher
 * valid on-chain. The EIP-712 domain (chainId + verifyingContract) is bound to
 * the target chain so a Celo voucher cannot be replayed on Soneium and vice versa.
 */
export async function signClaimVoucher(
  player: Address,
  h3Ids: string[],
  runId: string,
  chainKey: ChainKey = DEFAULT_CHAIN_KEY,
): Promise<SignVoucherResult> {
  if (!signerConfigured() || !isChainConfigured(chainKey)) {
    log.warn("signClaimVoucher skipped: missing config", { chainKey });
    return { ok: false, reason: "not-configured" };
  }
  if (h3Ids.length === 0) {
    return { ok: false, reason: "empty" };
  }
  const { hexesAddress, chainId } = getChain(chainKey);
  try {
    const tokenIds = h3Ids.map(h3ToTokenId);
    const nonce = runIdToNonce(runId);
    const account = privateKeyToAccount(SIGNER_PK);
    const signature = await account.signTypedData({
      domain: {
        name: "MiniKlaimHexes",
        version: "1",
        chainId,
        verifyingContract: hexesAddress,
      },
      types: CLAIM_RUN_TYPES,
      primaryType: "ClaimRun",
      message: { player, h3Ids: tokenIds, nonce },
    });
    log.info("voucher signed", { player, count: tokenIds.length, chainKey });
    return {
      ok: true,
      voucher: {
        tokenIds: tokenIds.map((t) => t.toString()),
        nonce: nonce.toString(),
        signature,
        contract: hexesAddress,
        chainId,
      },
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log.error("signClaimVoucher failed", { player, error: error.slice(0, 300) });
    return { ok: false, reason: "error", error };
  }
}
