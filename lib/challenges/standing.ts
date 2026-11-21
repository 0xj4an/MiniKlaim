/**
 * Where a player who paid the entry stands for the draw.
 *
 * Paying is not being in the draw: every badge of the challenge has to be
 * held onchain at the close. On 21 Nov 2026, 13 of the 31 entrants had paid
 * and did not hold them, and the card told every one of them "you are in
 * the draw if you hold the badges at the close" under a green tick.
 *
 * - "in":      holds them all. Nothing to do.
 * - "claim":   has earned what is missing; it only counts once claimed.
 * - "missing": at least one badge is not earned yet: needs a run.
 */
export type EntryStanding =
  | { state: "in" }
  | { state: "claim"; missing: number }
  | { state: "missing"; missing: number };

export function entryStanding(p: {
  badgeIds: readonly number[];
  held: ReadonlySet<number>;
  claimable: ReadonlySet<number>;
}): EntryStanding {
  const notHeld = p.badgeIds.filter((id) => !p.held.has(id));
  if (notHeld.length === 0) return { state: "in" };
  const notEarned = notHeld.filter((id) => !p.claimable.has(id));
  return notEarned.length > 0
    ? { state: "missing", missing: notHeld.length }
    : { state: "claim", missing: notHeld.length };
}

/** The reminder comes back at most this often for one challenge. */
export const REMINDER_EVERY_MS = 12 * 60 * 60 * 1000;

/** localStorage key holding when the reminder was last shown. */
export function reminderKey(challengeId: string): string {
  return `miniklaim_challenge_reminder_${challengeId}`;
}

/** `lastShown` is the stored value: a millisecond timestamp, or junk. */
export function reminderDue(lastShown: string | null, now: number): boolean {
  const at = Number(lastShown);
  if (!lastShown || !Number.isFinite(at)) return true;
  return now - at >= REMINDER_EVERY_MS;
}
