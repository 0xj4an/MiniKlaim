import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  type ChainKey,
  DEFAULT_CHAIN_KEY,
  getChain,
  isChainConfigured,
} from "@/lib/onchain/chains";
import { createLogger } from "@/lib/logger";

const log = createLogger("onchain:hexes");

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

function signerConfigured(): boolean {
  return SIGNER_PK.length === 66 && SIGNER_PK.startsWith("0x");
}

function isReady(chainKey: ChainKey): boolean {
  return signerConfigured() && isChainConfigured(chainKey);
}

export function hexesPublicClient(chainKey: ChainKey = DEFAULT_CHAIN_KEY) {
  return createPublicClient({
    chain: getChain(chainKey).chain,
    transport: http(),
  });
}

function signerAccount() {
  return privateKeyToAccount(SIGNER_PK);
}

function signerWallet(chainKey: ChainKey) {
  return createWalletClient({
    account: signerAccount(),
    chain: getChain(chainKey).chain,
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
 * Mint/transfer every hex in `h3Ids` to `player` in a single tx on `chainKey`.
 * Never throws.
 */
export async function captureBatch(
  player: Address,
  h3Ids: string[],
  chainKey: ChainKey = DEFAULT_CHAIN_KEY,
): Promise<CaptureBatchResult> {
  if (!isReady(chainKey)) {
    log.warn("captureBatch skipped: missing config", { chainKey });
    return { ok: false, reason: "not-configured" };
  }
  if (h3Ids.length === 0) {
    return { ok: false, reason: "empty" };
  }
  const { hexesAddress, chain } = getChain(chainKey);
  try {
    const tokenIds = h3Ids.map(h3ToTokenId);
    const wallet = signerWallet(chainKey);
    const txHash = await wallet.writeContract({
      address: hexesAddress,
      abi: HEXES_ABI,
      functionName: "captureBatch",
      args: [player, tokenIds],
      chain,
      account: signerAccount(),
    });
    log.info("captureBatch broadcast", {
      player,
      count: h3Ids.length,
      chainKey,
      txHash,
    });
    return { ok: true, txHash };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log.error("captureBatch failed", {
      player,
      count: h3Ids.length,
      chainKey,
      error: error.slice(0, 300),
    });
    return { ok: false, reason: "error", error };
  }
}

export function hexesContractAddress(
  chainKey: ChainKey = DEFAULT_CHAIN_KEY,
): Address | null {
  return isChainConfigured(chainKey) ? getChain(chainKey).hexesAddress : null;
}
