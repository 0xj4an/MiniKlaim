/**
 * How the client reads a sponsor-mint refusal.
 *
 * 402 (the player can pay their own fee) and 429 (this wallet used today's
 * sponsored allowance) are the server deciding, not a fault. 403 means this
 * client does not hold the run token: the run was played in another browser,
 * or local storage was cleared, so the relayer will not pay for it. None of
 * the three is actionable from an error report: the player is told the claim
 * did not go through and the retry cron picks the run up later: so all three
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

/**
 * The claim is asked of the relayer first, so a refusal is not the end of the
 * attempt: the player can still pay for their own run, which is what happened
 * on every claim before 4 Nov 2026.
 *
 * 402 is the relayer declining because the player can pay (it only says this
 * when its own balance is below the floor). 429 is this wallet's sponsored
 * allowance for the day, 200 blocks, which 11.7% of playing days exceed. 503
 * is the relayer itself failing. In all three the player paying is a better
 * outcome than telling them the run did not claim, so all three hand over.
 *
 * 403 is not here: it means this browser does not hold the run token, and the
 * voucher the player's own tx needs is gated on the same token, so there is
 * nothing to hand over to.
 */
export function sponsorWantsPlayerToPay(status: number): boolean {
  return status === 402 || status === 429 || status === 503;
}
