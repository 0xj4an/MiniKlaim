import { isValidCell } from "h3-js";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { withAttribution } from "@/lib/onchain/attribution";
import { sendExclusive } from "@/lib/onchain/relayerQueue";
import {
  type ChainKey,
  DEFAULT_CHAIN_KEY,
  getChain,
  isChainConfigured,
} from "@/lib/onchain/chains";
import { createLogger } from "@/lib/logger";
import { getSignerKey } from "@/lib/onchain/signer";

import { describeRpcFailure } from "@/lib/onchain/rpcFailure";
const log = createLogger("onchain:hexes");

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
    name: "mintTokensFor",
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
  try {
    const pk = getSignerKey();
    return pk.length === 66 && pk.startsWith("0x");
  } catch {
    return false;
  }
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
  return privateKeyToAccount(getSignerKey());
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

/**
 * The block behind a token id, or null when the id is not one of ours.
 * The inverse of h3ToTokenId: the id is the H3 index read as a number, and
 * `tokenURI` prints it in decimal.
 */
export function tokenIdToH3(tokenId: string): string | null {
  if (!/^[0-9]{1,20}$/.test(tokenId)) return null;
  const h3 = BigInt(tokenId).toString(16);
  return isValidCell(h3) ? h3 : null;
}

export type CaptureBatchResult =
  | { ok: true; txHash: Hex }
  | { ok: false; reason: "not-configured" | "empty" | "error"; error?: string };

// A 1534-hex captureBatch estimated past the block gas cap and reverted.
// 400 hexes is about 10M gas, under the 854-hex capture that mined at 20.3M.
export const CAPTURE_CHUNK = 400;
// Hexes v2 records at ~3k gas per hex, so a relayer chunk can be much larger.
export const CAPTURE_CHUNK_RECORDED = 4000;

export function chunkIds<T>(ids: readonly T[], size: number): T[][] {
  if (size < 1) return ids.length ? [ids.slice()] : [];
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

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
    const data = encodeFunctionData({
      abi: HEXES_ABI,
      functionName: "captureBatch",
      args: [player, tokenIds],
    });
    // Serialised: the relayer key is shared with the badge mint path and the
    // retry cron, and concurrent sends collide on the nonce.
    const txHash = await sendExclusive(() =>
      wallet.sendTransaction({
        to: hexesAddress,
        data: withAttribution(data),
        chain,
        account: signerAccount(),
        kzg: undefined,
      }),
    );
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
      // The node's reply in full; `error` above is cut before it gets there.
      rpc: describeRpcFailure(e),
    });
    return { ok: false, reason: "error", error };
  }
}

/**
 * Whether the chain's Hexes contract has `mintTokensFor` (added 17 Nov 2026,
 * live once the proxy is upgraded). Read by simulating an empty call from the
 * relayer, which is a no-op on the new implementation and a revert on the old
 * one, so the sponsored mint switches itself on with the upgrade. Cached for
 * ten minutes; a failed read counts as not available.
 */
const mintForCache = new Map<ChainKey, { ok: boolean; at: number }>();
export async function mintTokensForAvailable(
  chainKey: ChainKey = DEFAULT_CHAIN_KEY,
): Promise<boolean> {
  if (!isReady(chainKey)) return false;
  const cached = mintForCache.get(chainKey);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.ok;
  let ok = false;
  try {
    await hexesPublicClient(chainKey).simulateContract({
      address: getChain(chainKey).hexesAddress,
      abi: HEXES_ABI,
      functionName: "mintTokensFor",
      args: [signerAccount().address, []],
      account: signerAccount(),
    });
    ok = true;
  } catch {
    ok = false;
  }
  mintForCache.set(chainKey, { ok, at: Date.now() });
  return ok;
}

export type MintTokensForResult =
  | { ok: true; txHash: Hex; receiptLogs: Log[] }
  | { ok: false; reason: "not-configured" | "empty" | "error"; error?: string };

/**
 * Relayer-paid NFT mint: turn `h3Ids` into tokens owned by `player` and wait
 * for the receipt, so the caller can read which ones were minted. Never throws.
 */
export async function mintTokensForBatch(
  player: Address,
  h3Ids: string[],
  chainKey: ChainKey = DEFAULT_CHAIN_KEY,
): Promise<MintTokensForResult> {
  if (!isReady(chainKey)) return { ok: false, reason: "not-configured" };
  if (h3Ids.length === 0) return { ok: false, reason: "empty" };
  const { hexesAddress, chain } = getChain(chainKey);
  try {
    const wallet = signerWallet(chainKey);
    const data = encodeFunctionData({
      abi: HEXES_ABI,
      functionName: "mintTokensFor",
      args: [player, h3Ids.map(h3ToTokenId)],
    });
    // Serialised with every other relayer send: they share the nonce.
    const txHash = await sendExclusive(() =>
      wallet.sendTransaction({
        to: hexesAddress,
        data: withAttribution(data),
        chain,
        account: signerAccount(),
        kzg: undefined,
      }),
    );
    const receipt = await hexesPublicClient(chainKey).waitForTransactionReceipt({
      hash: txHash,
      timeout: 60_000,
    });
    if (receipt.status !== "success") {
      return { ok: false, reason: "error", error: `reverted ${txHash}` };
    }
    log.info("mintTokensFor done", { player, count: h3Ids.length, chainKey, txHash });
    return { ok: true, txHash, receiptLogs: receipt.logs };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log.error("mintTokensFor failed", {
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
