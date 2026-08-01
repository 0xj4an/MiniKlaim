import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import {
  createPublicClient,
  http,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { db } from "@/lib/db";
import { linkCodes, playerWallets, players, users } from "@/lib/db/schema";
import { type ChainKey, getChain } from "@/lib/onchain/chains";
import { createLogger } from "@/lib/logger";

const log = createLogger("players");

/**
 * Resolve the player id for a wallet, creating a fresh player on first sight.
 * Each (address, chainId) maps to exactly one player; linking moves a wallet
 * onto an existing player so identity (username) is shared across chains.
 */
export async function ensurePlayer(
  address: string,
  chainId: number,
): Promise<string> {
  const lower = address.toLowerCase();
  const [w] = await db
    .select({ playerId: playerWallets.playerId })
    .from(playerWallets)
    .where(and(eq(playerWallets.address, lower), eq(playerWallets.chainId, chainId)))
    .limit(1);
  if (w) return w.playerId;

  const [p] = await db.insert(players).values({}).returning({ id: players.id });
  await db
    .insert(playerWallets)
    .values({ address: lower, chainId, playerId: p.id, isPrimary: true })
    .onConflictDoNothing();
  return p.id;
}

/**
 * Shared username for a wallet, resolved through its player to whichever linked
 * wallet has a username set in `users` (primary first). Lets a linked Soneium
 * smart account inherit the name set on the Celo wallet. Null if none set.
 */
export async function usernameForAddress(
  address: string,
  chainId: number,
): Promise<string | null> {
  const lower = address.toLowerCase();
  const [w] = await db
    .select({ playerId: playerWallets.playerId })
    .from(playerWallets)
    .where(and(eq(playerWallets.address, lower), eq(playerWallets.chainId, chainId)))
    .limit(1);
  if (!w) return null;
  const rows = await db
    .select({ username: users.username, isPrimary: playerWallets.isPrimary })
    .from(playerWallets)
    .innerJoin(users, eq(users.address, playerWallets.address))
    .where(eq(playerWallets.playerId, w.playerId));
  const sorted = rows.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  for (const r of sorted) if (r.username) return r.username;
  return null;
}

/** All wallets (address + chain) attached to a wallet's player. */
export async function walletsForAddress(
  address: string,
  chainId: number,
): Promise<{ address: string; chainId: number }[]> {
  const lower = address.toLowerCase();
  const [w] = await db
    .select({ playerId: playerWallets.playerId })
    .from(playerWallets)
    .where(and(eq(playerWallets.address, lower), eq(playerWallets.chainId, chainId)))
    .limit(1);
  if (!w) return [];
  return db
    .select({ address: playerWallets.address, chainId: playerWallets.chainId })
    .from(playerWallets)
    .where(eq(playerWallets.playerId, w.playerId));
}

/**
 * All distinct wallet addresses attached to this address's player, across
 * every chain. Chain-agnostic: for aggregated reads (stats, runs, badges,
 * leaderboard) where we want the combined view over ALL linked wallets.
 * Falls back to `[address]` if the wallet has no player yet.
 */
export async function addressesForPlayer(address: string): Promise<string[]> {
  const lower = address.toLowerCase();
  const [w] = await db
    .select({ playerId: playerWallets.playerId })
    .from(playerWallets)
    .where(eq(playerWallets.address, lower))
    .limit(1);
  if (!w) return [lower];
  const rows = await db
    .select({ address: playerWallets.address })
    .from(playerWallets)
    .where(eq(playerWallets.playerId, w.playerId));
  const set = new Set(rows.map((r) => r.address.toLowerCase()));
  set.add(lower);
  return Array.from(set);
}

/**
 * Delete a player row if no wallets point at it anymore. Called after
 * `redeemLinkCode` moves the last wallet off the old player, to keep
 * `players` clean.
 */
async function cleanupOrphanPlayer(playerId: string): Promise<void> {
  const remaining = await db
    .select({ address: playerWallets.address })
    .from(playerWallets)
    .where(eq(playerWallets.playerId, playerId))
    .limit(1);
  if (remaining.length > 0) return;
  await db.delete(players).where(eq(players.id, playerId));
  log.info("orphan player deleted", { playerId });
}

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Generate a short link code bound to the requesting wallet's player. */
export async function createLinkCode(
  address: string,
  chainId: number,
): Promise<string> {
  const playerId = await ensurePlayer(address, chainId);
  const code = randomBytes(4).toString("hex").toUpperCase(); // 8 hex chars
  await db.insert(linkCodes).values({
    code,
    playerId,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return code;
}

export type RedeemResult = {
  ok: boolean;
  reason?:
    | "bad-code"
    | "bad-tx"
    | "tx-pending"
    | "tx-not-verifier"
    | "tx-wrong-data"
    | "tx-failed"
    | "error";
};

/**
 * Redeem a link code from a new wallet by verifying an on-chain ownership tx.
 *
 * The client sends a 0-value tx to `chain.linkVerifier` with `keccak256(code)`
 * as calldata (see `LinkExisting.tsx` / `LinkWallet.tsx`). We read the tx
 * receipt + tx here, verify the shape, extract `from = B`, and link B to the
 * code's player. Replaces the previous `personal_sign` flow (which failed
 * silently in MiniPay because MiniPay does not support message signing).
 */
export async function redeemLinkCode(
  code: string,
  chainKey: ChainKey,
  txHash: Hex,
): Promise<RedeemResult> {
  const [row] = await db
    .select({ playerId: linkCodes.playerId })
    .from(linkCodes)
    .where(and(eq(linkCodes.code, code), gt(linkCodes.expiresAt, new Date())))
    .limit(1);
  if (!row) return { ok: false, reason: "bad-code" };

  const chain = getChain(chainKey);
  const expectedData = keccak256(toBytes(code));
  const client = createPublicClient({ chain: chain.chain, transport: http() });

  try {
    const [receipt, tx] = await Promise.all([
      client.getTransactionReceipt({ hash: txHash }).catch(() => null),
      client.getTransaction({ hash: txHash }).catch(() => null),
    ]);
    if (!receipt || !tx) return { ok: false, reason: "tx-pending" };
    if (receipt.status !== "success") return { ok: false, reason: "tx-failed" };
    if (!tx.to || tx.to.toLowerCase() !== chain.linkVerifier.toLowerCase()) {
      return { ok: false, reason: "tx-not-verifier" };
    }
    // The client appends an ERC-8021 attribution suffix, so we match by
    // prefix. Suffix is fixed-length (see @celo/attribution-tags spec), so
    // `startsWith(expectedData)` is safe: an attacker cannot get a prefix
    // match without knowing the code (32-byte keccak256).
    if (!tx.input.toLowerCase().startsWith(expectedData.toLowerCase())) {
      return { ok: false, reason: "tx-wrong-data" };
    }

    const lower = tx.from.toLowerCase() as Address;

    // Snapshot the wallet's current player before we move it, so we can
    // clean up the old player row if it becomes orphaned.
    const [prior] = await db
      .select({ playerId: playerWallets.playerId })
      .from(playerWallets)
      .where(
        and(
          eq(playerWallets.address, lower),
          eq(playerWallets.chainId, chain.chainId),
        ),
      )
      .limit(1);

    // Attach the wallet to the code's player (replace any prior mapping).
    await db
      .insert(playerWallets)
      .values({
        address: lower,
        chainId: chain.chainId,
        playerId: row.playerId,
        isPrimary: false,
      })
      .onConflictDoUpdate({
        target: [playerWallets.address, playerWallets.chainId],
        set: { playerId: row.playerId },
      });
    await db.delete(linkCodes).where(eq(linkCodes.code, code));

    if (prior && prior.playerId !== row.playerId) {
      await cleanupOrphanPlayer(prior.playerId);
    }

    log.info("wallet linked", { address: lower, chainKey, txHash });
    return { ok: true };
  } catch (e) {
    log.error("redeemLinkCode failed", {
      txHash,
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, reason: "error" };
  }
}
