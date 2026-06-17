import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { createPublicClient, http, type Address } from "viem";
import { db } from "@/lib/db";
import { linkCodes, playerWallets, players, users } from "@/lib/db/schema";
import { type ChainKey, getChain } from "@/lib/onchain/chains";
import { linkChallenge } from "@/lib/linkChallenge";
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
  reason?: "bad-code" | "bad-signature" | "error";
};

/**
 * Redeem a link code from a new wallet: verify the wallet signed the challenge
 * (ECDSA for EOAs, EIP-1271 for smart accounts via the chain's RPC), then move
 * that (address, chainId) onto the code's player.
 */
export async function redeemLinkCode(
  code: string,
  address: string,
  chainKey: ChainKey,
  signature: `0x${string}`,
): Promise<RedeemResult> {
  const lower = address.toLowerCase() as Address;
  const [row] = await db
    .select({ playerId: linkCodes.playerId })
    .from(linkCodes)
    .where(and(eq(linkCodes.code, code), gt(linkCodes.expiresAt, new Date())))
    .limit(1);
  if (!row) return { ok: false, reason: "bad-code" };

  const chain = getChain(chainKey);
  try {
    const client = createPublicClient({ chain: chain.chain, transport: http() });
    const valid = await client.verifyMessage({
      address: lower,
      message: linkChallenge(code),
      signature,
    });
    if (!valid) return { ok: false, reason: "bad-signature" };

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
    log.info("wallet linked", { address: lower, chainKey });
    return { ok: true };
  } catch (e) {
    log.error("redeemLinkCode failed", {
      address: lower,
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, reason: "error" };
  }
}
