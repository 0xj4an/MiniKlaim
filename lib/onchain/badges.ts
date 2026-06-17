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
// Ids are grouped contiguously by category, each group starting with a "first"
// entry badge (tiers ascending within a group): territory 1-9, runs 10-15,
// single-run 16-19, distance 20-25, streaks 26-33, cities 34-42, conquest
// 43-47, countries 48-55.
export const BADGE_IDS = {
  // Territory owned.
  firstBlock: BigInt(1),
  fiveBlocks: BigInt(2),
  mayor: BigInt(3),
  hundred: BigInt(4),
  baron: BigInt(5),
  duke: BigInt(6),
  kingdom: BigInt(7),
  empire: BigInt(8),
  dominion: BigInt(9),
  // Run volume.
  firstSteps: BigInt(10),
  iron: BigInt(11),
  veteran: BigInt(12),
  relentless: BigInt(13),
  machine: BigInt(14),
  legend: BigInt(15),
  // Single-run feats.
  bigRun: BigInt(16),
  marathon: BigInt(17),
  halfMarathon: BigInt(18),
  fullMarathon: BigInt(19),
  // Lifetime distance.
  pacer: BigInt(20),
  roadrunner: BigInt(21),
  ultra: BigInt(22),
  ironLegs: BigInt(23),
  earthstrider: BigInt(24),
  equator: BigInt(25),
  // Streaks (not yet awarded).
  threeDays: BigInt(26),
  oneWeek: BigInt(27),
  twoWeeks: BigInt(28),
  oneMonth: BigInt(29),
  twoMonths: BigInt(30),
  threeMonths: BigInt(31),
  sixMonths: BigInt(32),
  oneYear: BigInt(33),
  // Exploration (distinct cities = H3 res-5 clusters).
  firstCity: BigInt(34),
  explorer: BigInt(35),
  wanderer: BigInt(36),
  pioneer: BigInt(37),
  cartographer: BigInt(38),
  atlas: BigInt(39),
  voyager: BigInt(40),
  odyssey: BigInt(41),
  worldwalker: BigInt(42),
  // Conquest (hexes captured from rivals).
  firstBlood: BigInt(43),
  raider: BigInt(44),
  warlord: BigInt(45),
  conqueror: BigInt(46),
  overlord: BigInt(47),
  // Distinct countries.
  firstCountry: BigInt(48),
  borderCrosser: BigInt(49),
  globetrotter: BigInt(50),
  worldCitizen: BigInt(51),
  continental: BigInt(52),
  planetary: BigInt(53),
  hemispheric: BigInt(54),
  worldwide: BigInt(55),
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
      // viem 2.50.4's readContract type requires `authorizationList`, but passing
      // an empty array makes the RPC reject the call ("Missing or invalid
      // parameters"), which silently returned no held badges. `undefined`
      // satisfies the type and is ignored at runtime. Do not change to [].
      authorizationList: undefined,
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
