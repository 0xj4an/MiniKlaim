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

const log = createLogger("onchain:badges");

const BADGES_ADDRESS = (process.env.NEXT_PUBLIC_MINIKLAIM_BADGES_ADDRESS ??
  "") as Address;
const SIGNER_PK = (process.env.SERVER_SIGNER_PRIVATE_KEY ?? "") as Hex;

const BADGES_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "player", type: "address" },
      { name: "badgeId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "mintBatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "player", type: "address" },
      { name: "badgeIds", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

function isConfigured(): boolean {
  return (
    BADGES_ADDRESS.length === 42 &&
    BADGES_ADDRESS.startsWith("0x") &&
    SIGNER_PK.length === 66 &&
    SIGNER_PK.startsWith("0x")
  );
}

export const badgesPublicClient = createPublicClient({
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
 * Canonical badge id catalog. Keep in sync with the in-app badge list
 * (see app/me/page.tsx `buildAchievements`). IDs are uint256 on-chain;
 * tracked here as small integers.
 */
export const BADGE_IDS = {
  firstSteps: BigInt(1),
  fiveBlocks: BigInt(2),
  mayor: BigInt(3),
  hundred: BigInt(4),
  threeDays: BigInt(5),
  oneWeek: BigInt(6),
  twoWeeks: BigInt(7),
  bigRun: BigInt(8),
  marathon: BigInt(9),
  iron: BigInt(10),
} as const;

export type MintBadgesResult =
  | { ok: true; txHash: Hex; minted: bigint[] }
  | { ok: false; reason: "not-configured" | "empty" | "error"; error?: string };

/**
 * Send a `mintBatch(player, badgeIds[])` tx. The on-chain `mintBatch` skips
 * any badge the player already holds, so callers can pass the full list of
 * "currently eligible" badges every time without checking on-chain state.
 */
export async function mintBadgesBatch(
  player: Address,
  badgeIds: bigint[],
): Promise<MintBadgesResult> {
  if (!isConfigured()) {
    log.warn("mintBadgesBatch skipped: missing env config");
    return { ok: false, reason: "not-configured" };
  }
  if (badgeIds.length === 0) {
    return { ok: false, reason: "empty" };
  }
  try {
    const wallet = signerWallet();
    const txHash = await wallet.writeContract({
      address: BADGES_ADDRESS,
      abi: BADGES_ABI,
      functionName: "mintBatch",
      args: [player, badgeIds],
      chain: celo,
      account: signerAccount(),
    });
    log.info("badges mintBatch broadcast", {
      player,
      candidates: badgeIds.map((b) => Number(b)),
      txHash,
    });
    return { ok: true, txHash, minted: badgeIds };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log.error("badges mintBatch failed", {
      player,
      candidates: badgeIds.map((b) => Number(b)),
      error: error.slice(0, 300),
    });
    return { ok: false, reason: "error", error };
  }
}

export function badgesContractAddress(): Address | null {
  return isConfigured() ? BADGES_ADDRESS : null;
}
