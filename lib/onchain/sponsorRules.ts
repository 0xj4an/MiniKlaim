import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Pure rules for when the relayer pays for a player's mint. No I/O here so
 * the numbers can be tested and tuned in one place. `sponsor.ts` does the
 * chain and database reads around them.
 */

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Hexes the relayer mints for one wallet in a rolling 24h window. */
export function dailyHexCap(): number {
  return intFromEnv("SPONSOR_DAILY_HEX_CAP", 200);
}

/** Sponsored badge transactions for one wallet in a rolling 24h window. */
export function dailyBadgeTxCap(): number {
  return intFromEnv("SPONSOR_DAILY_BADGE_TX_CAP", 2);
}

/** Below this the relayer raises an alert. In CELO. */
export function relayerLowBalanceCelo(): number {
  return intFromEnv("RELAYER_LOW_BALANCE_CELO", 5);
}

// Measured on mainnet: about 28k gas per hex in large captureBatch txs, more
// in small ones. The player path goes through the router and a voucher check,
// so this leans high. A high estimate only makes us sponsor more often, never
// refuse a player who could not actually pay.
const GAS_PER_HEX = 35_000n;
// Hexes v2 records instead of minting: about 3k gas per hex through the router
// (8,000 hexes measured at 24.1M execution plus 1.8M calldata). Leans high too.
const GAS_PER_HEX_RECORDED = 4_000n;
const GAS_BASE = 200_000n;
const GAS_PER_BADGE = 100_000n;

/**
 * Above this many hexes the player's single claim tx no longer fits a 30M gas
 * block, so they cannot pay for the run however much they hold.
 */
export const PLAYER_TX_MAX_HEXES = 700;
/** Same limit once the chain's Hexes contract records (v2): ~26M gas. */
export const PLAYER_TX_MAX_HEXES_RECORDED = 8_000;

export function playerTxMaxHexes(recorded: boolean): number {
  return recorded ? PLAYER_TX_MAX_HEXES_RECORDED : PLAYER_TX_MAX_HEXES;
}

export function estimateClaimGas(
  hexCount: number,
  badgeCount = 0,
  recorded = false,
): bigint {
  return (
    GAS_BASE +
    (recorded ? GAS_PER_HEX_RECORDED : GAS_PER_HEX) *
      BigInt(Math.max(0, hexCount)) +
    GAS_PER_BADGE * BigInt(Math.max(0, badgeCount))
  );
}

/**
 * Hexes a player may turn into tokens in one `mintTokens` tx. Each mint is a
 * real ERC-721 mint (~28k gas), so this keeps the tx near 20M gas.
 */
export const MINT_TOKENS_MAX = 700;

/**
 * The smaller batch offered beside "mint everything". The fee is the player's
 * own and grows with the count, so a wallet that cannot afford 700 can still
 * mint something: 100 costs roughly a seventh.
 */
export const MINT_TOKENS_SMALL_BATCH = 100;

/**
 * Batch size asked for by the client, clamped. The player picks between the
 * whole lot and a smaller one, so a bad or missing value must mean "the
 * maximum" rather than a zero-length voucher or a tx the contract refuses.
 */
export function parseMintLimit(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { limit?: unknown }).limit;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const n = Math.floor(raw);
  if (n < 1) return null;
  return Math.min(n, MINT_TOKENS_MAX);
}

/** Gas for one `mintTokens` tx of `count` hexes. */
export function estimateMintTokensGas(count: number): bigint {
  return GAS_BASE + 30_000n * BigInt(Math.max(0, count));
}

/**
 * Network fee in CELO wei with a 30% buffer. Paying in a fee currency adds
 * its own debit/credit gas on Celo, and the base fee can move between our
 * read and the player's tx.
 */
export function feeWithBuffer(gas: bigint, gasPrice: bigint): bigint {
  return (gas * gasPrice * 13n) / 10n;
}

/**
 * Convert a CELO-wei fee into the token's own units using the
 * FeeCurrencyDirectory rate (token per CELO, both 18-decimal scaled).
 */
export function feeInToken(
  feeWei: bigint,
  rate: { numerator: bigint; denominator: bigint },
  tokenDecimals: number,
): bigint {
  if (rate.denominator === 0n) return 0n;
  const in18 = (feeWei * rate.numerator) / rate.denominator;
  if (tokenDecimals >= 18) return in18 * 10n ** BigInt(tokenDecimals - 18);
  const scale = 10n ** BigInt(18 - tokenDecimals);
  // Round up so a balance one unit short does not count as enough.
  return (in18 + scale - 1n) / scale;
}

/** How many hexes the relayer may still mint for this wallet today. */
export function remainingHexAllowance(
  usedLast24h: number,
  cap = dailyHexCap(),
): number {
  return Math.max(0, cap - Math.max(0, usedLast24h));
}

export function newRunToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashRunToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time check of a presented token against the stored hash. */
export function runTokenMatches(
  storedHash: string | null | undefined,
  presented: string | null | undefined,
): boolean {
  if (!storedHash || !presented) return false;
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(hashRunToken(presented), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const RUN_TOKEN_HEADER = "x-run-token";

/** Visits that must show an unminted run before the relayer steps in. */
export const OFFERS_BEFORE_SPONSOR = 3;
/** Two prompts closer together than this count as one visit. */
export const OFFER_COOLDOWN_HOURS = 6;

export type MintStatus =
  | "claimed"
  | "declined"
  | "sponsored"
  | "sponsor_denied"
  | "sponsor_capped"
  | "sponsor_failed";
