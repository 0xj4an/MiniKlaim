import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Pure rules for the per-device owner key. No I/O, so they can be tested;
 * lib/ownerKey.ts does the database reads around them.
 *
 * MiniPay cannot sign messages, and the link-proof transaction never gets
 * through it (30 days to 13 Nov 2026: 482 attempts, 0 linked, 419 refused
 * as permission_denied). So a wallet cannot prove itself on demand. Instead
 * the server hands a random key to the phone the first time the wallet is
 * seen, and asks for it back before a name change or a link code.
 */

export const OWNER_KEY_HEADER = "x-owner-key";

/**
 * Wallets that played before owner keys existed get theirs by showing the
 * token of a run they started before this moment. Nobody else holds those:
 * the server handed each one to the phone that started the run. A run token
 * from after it proves nothing, since anyone can start a run on any address.
 * Set before the change was public, so nobody could stock up on tokens for
 * other people's addresses in advance.
 */
export const OWNER_KEY_BOOTSTRAP_BEFORE = new Date("2026-11-13T20:00:00Z");

export function newOwnerKey(): string {
  return randomBytes(24).toString("base64url");
}

export function hashOwnerKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Constant-time check of a presented key against the stored hash. */
export function ownerKeyMatches(
  storedHash: string | null | undefined,
  presented: string | null | undefined,
): boolean {
  if (!storedHash || !presented) return false;
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(hashOwnerKey(presented), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Whether a key may be handed out for a wallet.
 *
 * - `proven`: the caller showed a run token from before the bootstrap
 *   moment. Issues a new key, replacing any old one, so a phone that lost
 *   its key but kept its run tokens gets back in.
 * - `fresh`: the wallet has no key, no name and no runs, so it has nothing to
 *   take over. The first phone to ask is its owner.
 * - otherwise: no.
 */
export function ownerKeyDecision(args: {
  hasKey: boolean;
  hasUsername: boolean;
  hasRuns: boolean;
  provenByOldRun: boolean;
}): "proven" | "fresh" | "refused" {
  if (args.provenByOldRun) return "proven";
  if (!args.hasKey && !args.hasUsername && !args.hasRuns) return "fresh";
  return "refused";
}
