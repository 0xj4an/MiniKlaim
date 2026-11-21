/**
 * Should a player who paid to enter the weekly challenge be reminded that
 * they are not in the draw yet?
 *
 * Entering only buys the ticket: the draw takes entrants who hold every
 * badge of the challenge onchain when the week closes. On 21 Nov 2026, the
 * day before the close, 13 of 31 entrants had paid and did not hold them.
 * The challenge card says so, but it sits below the fold on the home screen.
 */
export type ReminderInput = {
  challenge: { id: string; badgeIds: number[]; closesAt: string } | null;
  player?: { entered: boolean; held: number[]; claimable: number[] } | null;
};

export type Reminder = {
  challengeId: string;
  /** Badges not held onchain yet, in the challenge's order. */
  missing: number[];
  /** Of those, the ones already earned: one tap in the profile mints them. */
  claimable: number[];
  /** What closes the gap: claim what is earned, else go and run. */
  action: "claim" | "run";
  closesAt: string;
};

/** A dismissed reminder stays away this long, then comes back if still due. */
export const REMINDER_SNOOZE_MS = 12 * 60 * 60 * 1000;

export function challengeReminder(
  input: ReminderInput,
  now: number,
  dismissedAt: number | null,
): Reminder | null {
  const c = input.challenge;
  const p = input.player;
  if (!c || !p?.entered) return null;
  if (now >= new Date(c.closesAt).getTime()) return null;
  const held = new Set(p.held);
  const missing = c.badgeIds.filter((id) => !held.has(id));
  if (missing.length === 0) return null;
  if (dismissedAt !== null && now - dismissedAt < REMINDER_SNOOZE_MS) return null;
  const earned = new Set(p.claimable);
  const claimable = missing.filter((id) => earned.has(id));
  return {
    challengeId: c.id,
    missing,
    claimable,
    action: claimable.length > 0 ? "claim" : "run",
    closesAt: c.closesAt,
  };
}
