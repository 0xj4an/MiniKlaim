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
  // Territory tiers beyond 100.
  baron: BigInt(11),
  duke: BigInt(12),
  kingdom: BigInt(13),
  // Lifetime distance.
  pacer: BigInt(14),
  roadrunner: BigInt(15),
  ultra: BigInt(16),
  // Single-run distance.
  halfMarathon: BigInt(17),
  fullMarathon: BigInt(18),
  // Exploration (distinct cities = H3 res-5 clusters).
  explorer: BigInt(19),
  wanderer: BigInt(20),
  pioneer: BigInt(21),
  // Run volume.
  veteran: BigInt(22),
  relentless: BigInt(23),
  // Conquest (hexes captured from rivals).
  firstBlood: BigInt(24),
  raider: BigInt(25),
  warlord: BigInt(26),
  // Distinct countries.
  borderCrosser: BigInt(27),
  globetrotter: BigInt(28),
  worldCitizen: BigInt(29),
  continental: BigInt(30),
  planetary: BigInt(31),
  // Legendary tier (planet-scale goals).
  empire: BigInt(32),
  dominion: BigInt(33),
  ironLegs: BigInt(34),
  earthstrider: BigInt(35),
  equator: BigInt(36),
  machine: BigInt(37),
  legend: BigInt(38),
  cartographer: BigInt(39),
  atlas: BigInt(40),
  conqueror: BigInt(41),
  overlord: BigInt(42),
  hemispheric: BigInt(43),
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
