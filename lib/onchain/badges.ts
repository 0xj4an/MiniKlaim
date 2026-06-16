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
  {
    type: "function",
    name: "balanceOfBatch",
    stateMutability: "view",
    inputs: [
      { name: "accounts", type: "address[]" },
      { name: "ids", type: "uint256[]" },
    ],
    outputs: [{ type: "uint256[]" }],
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
// Ids are grouped contiguously by category (tiers ascending within a group):
// territory 1-8, runs 9-14, single-run 15-18, distance 19-24, streaks 25-27,
// cities 28-32, conquest 33-37, countries 38-43.
export const BADGE_IDS = {
  // Territory owned.
  fiveBlocks: BigInt(1),
  mayor: BigInt(2),
  hundred: BigInt(3),
  baron: BigInt(4),
  duke: BigInt(5),
  kingdom: BigInt(6),
  empire: BigInt(7),
  dominion: BigInt(8),
  // Run volume.
  firstSteps: BigInt(9),
  iron: BigInt(10),
  veteran: BigInt(11),
  relentless: BigInt(12),
  machine: BigInt(13),
  legend: BigInt(14),
  // Single-run feats.
  bigRun: BigInt(15),
  marathon: BigInt(16),
  halfMarathon: BigInt(17),
  fullMarathon: BigInt(18),
  // Lifetime distance.
  pacer: BigInt(19),
  roadrunner: BigInt(20),
  ultra: BigInt(21),
  ironLegs: BigInt(22),
  earthstrider: BigInt(23),
  equator: BigInt(24),
  // Streaks (not yet awarded).
  threeDays: BigInt(25),
  oneWeek: BigInt(26),
  twoWeeks: BigInt(27),
  // Exploration (distinct cities = H3 res-5 clusters).
  explorer: BigInt(28),
  wanderer: BigInt(29),
  pioneer: BigInt(30),
  cartographer: BigInt(31),
  atlas: BigInt(32),
  // Conquest (hexes captured from rivals).
  firstBlood: BigInt(33),
  raider: BigInt(34),
  warlord: BigInt(35),
  conqueror: BigInt(36),
  overlord: BigInt(37),
  // Distinct countries.
  borderCrosser: BigInt(38),
  globetrotter: BigInt(39),
  worldCitizen: BigInt(40),
  continental: BigInt(41),
  planetary: BigInt(42),
  hemispheric: BigInt(43),
  worldwide: BigInt(44),
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

/**
 * Read which badges this player currently holds on-chain. Returns the set
 * of badge IDs (as numbers) where the on-chain balance is non-zero.
 */
export async function onchainBadgeIdsHeld(player: Address): Promise<number[]> {
  if (!isConfigured()) return [];
  const allIds = Object.values(BADGE_IDS);
  const accounts: Address[] = Array(allIds.length).fill(player);
  try {
    const balances = (await badgesPublicClient.readContract({
      address: BADGES_ADDRESS,
      abi: BADGES_ABI,
      functionName: "balanceOfBatch",
      args: [accounts, allIds],
      authorizationList: [],
    })) as readonly bigint[];
    const held: number[] = [];
    balances.forEach((bal, i) => {
      if (bal > BigInt(0)) held.push(Number(allIds[i]));
    });
    return held;
  } catch (e) {
    log.warn("onchainBadgeIdsHeld failed", {
      player,
      error: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}
