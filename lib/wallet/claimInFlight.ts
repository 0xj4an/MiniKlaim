"use client";

/**
 * Cross-component registry of claims that are already on their way on-chain.
 *
 * Both claim prompts decide whether to ask the player for a signature by
 * comparing server or chain state against what the player has earned. Neither
 * source knows about a claim that is mid-flight, so without this registry the
 * player gets asked twice for work they already approved:
 *
 * - `PendingClaimPrompt` treats a run as unclaimed while `hexes.mint_tx_hash`
 *   is NULL, and `usePendingClaim` refetches on `window.focus`. In MiniPay the
 *   wallet drawer opening and closing fires that focus event, so the prompt
 *   reappeared for the exact run whose claim tx the player was approving.
 * - `BadgeClaimPrompt` compares on-chain `heldIds` against voucher
 *   eligibility. A submitted badge tx is invisible to that read until it
 *   confirms, so the prompt reappeared for badges already claimed.
 *
 * Module scope is deliberate: the run page, the home page and /me each mount
 * their own hook instances, and they all have to agree on what is in flight.
 */

/** Runs whose hex claim is between "wallet asked" and "claim call settled". */
const claimingRuns = new Set<string>();

/** Badge id -> submission timestamp, for badges awaiting chain confirmation. */
const submittedBadges = new Map<number, number>();

/**
 * How long a submitted badge stays suppressed. Celo blocks are ~1s, so this is
 * far longer than a confirmation needs; the window exists only so a reverted
 * claim becomes claimable again without the player reloading the app.
 */
export const BADGE_CLAIM_SUPPRESS_MS = 120_000;

export function markRunClaiming(runId: string): void {
  claimingRuns.add(runId);
}

export function clearRunClaiming(runId: string): void {
  claimingRuns.delete(runId);
}

export function isRunClaiming(runId: string): boolean {
  return claimingRuns.has(runId);
}

export function markBadgeClaimSubmitted(badgeIds: number[]): void {
  const now = Date.now();
  for (const id of badgeIds) submittedBadges.set(id, now);
}

/**
 * Forget a submission, either because the claim failed (so the player should be
 * asked again) or because a chain read now shows the badge as held.
 */
export function dropBadgeClaims(badgeIds: number[]): void {
  for (const id of badgeIds) submittedBadges.delete(id);
}

export function isBadgeClaimPending(badgeId: number): boolean {
  const at = submittedBadges.get(badgeId);
  if (at === undefined) return false;
  if (Date.now() - at < BADGE_CLAIM_SUPPRESS_MS) return true;
  submittedBadges.delete(badgeId);
  return false;
}
