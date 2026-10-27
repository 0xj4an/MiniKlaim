/**
 * How the client reads a sponsor-mint refusal.
 *
 * 402 (the player can pay their own fee) and 429 (this wallet used today's
 * sponsored allowance) are the server deciding, not a fault. 403 means this
 * client does not hold the run token: the run was played in another browser,
 * or local storage was cleared, so the relayer will not pay for it. None of
 * the three is actionable from an error report — the player is told the claim
 * did not go through and the retry cron picks the run up later — so all three
 * are tracked and none is raised to Sentry.
 *
 * `useClaimRun` already treated 403 as a refusal while `useClaimAll` reported
 * it as a failed mint, which is why one lost run token paged as a regression
 * (MINIKLAIM-N, 27 Oct). Both paths now share this.
 */
export type SponsorRefusal = "refused" | "failed";

export function sponsorRefusalFor(status: number): SponsorRefusal | null {
  if (status === 402) return "refused";
  if (status === 429 || status === 403) return "failed";
  return null;
}
