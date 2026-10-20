import { randomBytes } from "node:crypto";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import {
  type Address,
  type Hex,
  type Log,
  parseEventLogs,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hexes } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { type ChainKey, getChain, isChainConfigured } from "@/lib/onchain/chains";
import { h3ToTokenId, hexesPublicClient } from "@/lib/onchain/hexes";
import { getSignerKey, isSignerConfigured } from "@/lib/onchain/signer";

const log = createLogger("onchain:mintTokens");

/**
 * Hexes v2 records captures instead of minting a token per hex. A player turns
 * their recorded hexes into ERC-721 tokens later, when they choose, with
 * `mintTokens`, paying the fee themselves. The backend signs a voucher only for
 * hexes the player owns right now in the database (the canonical owner list)
 * and that have no token yet on-chain.
 */

/** A voucher is good for this long. Keeps the window short in which someone
 *  else could recapture a hex before the player's mint lands. */
export const MINT_VOUCHER_TTL_SEC = 15 * 60;

// EIP-712 type matching MiniKlaimHexes.MINT_TOKENS_TYPEHASH.
const MINT_TOKENS_TYPES = {
  MintTokens: [
    { name: "player", type: "address" },
    { name: "h3Ids", type: "uint256[]" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const HEXES_TOKEN_ABI = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
] as const;

export type MintTokensVoucher = {
  h3Ids: string[]; // uint256 as decimal strings
  nonce: string;
  deadline: string;
  signature: Hex;
  contract: Address;
  chainId: number;
};

export function tokenIdToH3(id: bigint): string {
  return id.toString(16).padStart(15, "0");
}

export async function signMintTokensVoucher(
  player: Address,
  h3Ids: string[],
  chainKey: ChainKey,
  now = Date.now(),
): Promise<MintTokensVoucher | null> {
  if (!isSignerConfigured() || !isChainConfigured(chainKey) || h3Ids.length === 0) {
    return null;
  }
  const { hexesAddress, chainId } = getChain(chainKey);
  const tokenIds = h3Ids.map(h3ToTokenId);
  const nonce = BigInt(`0x${randomBytes(32).toString("hex")}`);
  const deadline = BigInt(Math.floor(now / 1000) + MINT_VOUCHER_TTL_SEC);
  const account = privateKeyToAccount(getSignerKey());
  const signature = await account.signTypedData({
    domain: {
      name: "MiniKlaimHexes",
      version: "1",
      chainId,
      verifyingContract: hexesAddress,
    },
    types: MINT_TOKENS_TYPES,
    primaryType: "MintTokens",
    message: { player, h3Ids: tokenIds, nonce, deadline },
  });
  return {
    h3Ids: tokenIds.map((t) => t.toString()),
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    signature,
    contract: hexesAddress,
    chainId,
  };
}

/**
 * Split `h3Ids` into those with no token on-chain and those that already have
 * one (with its owner). `ownerOf` reverts for a hex without a token.
 */
export async function splitByToken(
  h3Ids: string[],
  chainKey: ChainKey,
): Promise<{ tokenless: string[]; existing: Array<{ h3: string; owner: Address }> }> {
  if (h3Ids.length === 0) return { tokenless: [], existing: [] };
  const client = hexesPublicClient(chainKey);
  const { hexesAddress } = getChain(chainKey);
  const results = await client.multicall({
    allowFailure: true,
    batchSize: 1024 * 64,
    // Same viem typing quirk as badges.ts: undefined, never [].
    authorizationList: undefined,
    contracts: h3Ids.map((h3) => ({
      address: hexesAddress,
      abi: HEXES_TOKEN_ABI,
      functionName: "ownerOf" as const,
      args: [h3ToTokenId(h3)] as const,
    })),
  });
  const tokenless: string[] = [];
  const existing: Array<{ h3: string; owner: Address }> = [];
  results.forEach((r, i) => {
    if (r.status === "success" && r.result !== zeroAddress) {
      existing.push({ h3: h3Ids[i], owner: r.result as Address });
    } else {
      tokenless.push(h3Ids[i]);
    }
  });
  return { tokenless, existing };
}

/** Hexes minted (Transfer from zero) to `to` by the Hexes contract in `logs`. */
export function mintedTo(
  logs: Log[],
  hexesAddress: Address,
  to: Address,
): string[] {
  const own = logs.filter(
    (l) => l.address.toLowerCase() === hexesAddress.toLowerCase(),
  );
  return parseEventLogs({ abi: HEXES_TOKEN_ABI, logs: own, eventName: "Transfer" })
    .filter(
      (e) =>
        e.args.from === zeroAddress &&
        e.args.to.toLowerCase() === to.toLowerCase(),
    )
    .map((e) => tokenIdToH3(e.args.tokenId));
}

/** Hexes this wallet owns, settled on-chain, with no token yet (DB view). */
export function tokenlessOwnedWhere(lower: string) {
  return and(
    eq(hexes.ownerAddress, lower),
    isNotNull(hexes.mintedAt),
    isNull(hexes.tokenAt),
  );
}

export { log as mintTokensLog };
