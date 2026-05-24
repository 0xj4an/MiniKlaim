import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { createLogger } from "@/lib/logger";

const log = createLogger("onchain:hexes");

const HEXES_ADDRESS = (process.env.NEXT_PUBLIC_MINIKLAIM_HEXES_ADDRESS ??
  "") as Address;
const SIGNER_PK = (process.env.SERVER_SIGNER_PRIVATE_KEY ?? "") as Hex;

const HEXES_ABI = [
  {
    type: "function",
    name: "capture",
    stateMutability: "nonpayable",
    inputs: [
      { name: "player", type: "address" },
      { name: "h3Id", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "captureBatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "player", type: "address" },
      { name: "h3Ids", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

function isConfigured(): boolean {
  return (
    HEXES_ADDRESS.length === 42 &&
    HEXES_ADDRESS.startsWith("0x") &&
    SIGNER_PK.length === 66 &&
    SIGNER_PK.startsWith("0x")
  );
}

export const hexesPublicClient = createPublicClient({
  chain: celo,
  transport: http(),
});

function signerAccount() {
  return privateKeyToAccount(SIGNER_PK);
}

function signerWallet() {
  return createWalletClient({
    account: signerAccount(),
    chain: celo,
    transport: http(),
  });
}

/**
 * Convert an H3 cell index (15-char lowercase hex string from h3-js) to the
 * uint256 token id used by the contract.
 */
export function h3ToTokenId(h3: string): bigint {
  return BigInt(`0x${h3}`);
}

export type CaptureBatchResult =
  | { ok: true; txHash: Hex }
  | { ok: false; reason: "not-configured" | "empty" | "error"; error?: string };

/**
 * Mint/transfer every hex in `h3Ids` to `player` in a single tx.
 * Fire-and-forget callers should handle the returned promise; the function
 * never throws.
 */
export async function captureBatch(
  player: Address,
  h3Ids: string[],
): Promise<CaptureBatchResult> {
  if (!isConfigured()) {
    log.warn("captureBatch skipped: missing env config");
    return { ok: false, reason: "not-configured" };
  }
  if (h3Ids.length === 0) {
    return { ok: false, reason: "empty" };
  }
  try {
    const tokenIds = h3Ids.map(h3ToTokenId);
    const wallet = signerWallet();
    const txHash = await wallet.writeContract({
      address: HEXES_ADDRESS,
      abi: HEXES_ABI,
      functionName: "captureBatch",
      args: [player, tokenIds],
      chain: celo,
      account: signerAccount(),
    });
    log.info("captureBatch broadcast", {
      player,
      count: h3Ids.length,
      txHash,
    });
    return { ok: true, txHash };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log.error("captureBatch failed", {
      player,
      count: h3Ids.length,
      error: error.slice(0, 300),
    });
    return { ok: false, reason: "error", error };
  }
}

export function hexesContractAddress(): Address | null {
  return isConfigured() ? HEXES_ADDRESS : null;
}
