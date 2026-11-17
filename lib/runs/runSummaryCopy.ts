// Pure decisions behind the run summary and its share caption, safe to
// import from client components.

/**
 * The distance a finished run shows. The phone's own figure drops distance
 * when GPS fixes are far apart, and the server measures the hex path
 * independently: in the 7 days to 17 Nov 2026 the phone reported less than
 * half of the server's path in 40 of 661 runs with blocks. The larger of the
 * two is the better figure, which is also what the server uses to label the
 * run's mode.
 */
export function shownDistanceMeters(
  clientMeters: number,
  serverMeters: number | null | undefined,
): number {
  const client = Number.isFinite(clientMeters) ? Math.max(0, clientMeters) : 0;
  const server =
    typeof serverMeters === "number" && Number.isFinite(serverMeters)
      ? Math.max(0, serverMeters)
      : 0;
  return Math.round(Math.max(client, server));
}

/**
 * What a finished run has worth sharing.
 *
 * The share row sits behind a finished claim, and a run with no new blocks
 * still gets a claim when the player has badges to collect. The caption was
 * always about blocks, so those players posted "Just captured 0 blocks":
 * 18 of 60 share taps in the 30 days to 17 Nov 2026, and four of the seven
 * public posts that mention the game. With no blocks the caption is about
 * the badges, and with neither there is nothing to share.
 */
export function shareKind(run: {
  hexesClaimed: number;
  badgeCount: number;
}): "blocks" | "badges" | "none" {
  if (run.hexesClaimed > 0) return "blocks";
  if (run.badgeCount > 0) return "badges";
  return "none";
}

/**
 * Why a run ended with no new block, from the capture status it finished in
 * (lib/runs/captureStatus). Null when the run did something (reinforced or
 * attacked), where the plain "nothing new to claim" line is the right one.
 */
export function emptyRunReason(
  captureState: string | null | undefined,
): "gps" | "repeat" | "owned" | "still" | null {
  if (captureState === "searching") return "gps";
  if (captureState === "repeat") return "repeat";
  if (captureState === "owned") return "owned";
  if (captureState === "ready") return "still";
  return null;
}

/**
 * How long a run may sit without an accurate GPS fix before the screen says
 * so in a banner. The status line already says "finding GPS", and it was not
 * enough: in the 7 days to 17 Nov 2026, 20 runs spent more than five minutes
 * in that state and ended with nothing, and one player walked for 35 minutes
 * and then posted the result.
 */
export const GPS_STUCK_AFTER_MS = 120_000;

/**
 * What to tell a player about the block they are standing on, before they
 * start. A run started on a block already used today does nothing until the
 * player moves (one action per block per player per day), and they were not
 * told: in the 7 days to 17 Nov 2026, 169 runs of 67 players ended with no
 * blocks in the "repeat" state, 145 of them in under a minute. Without hex
 * strength the same happens on a block the player already owns.
 */
export function startSpot(input: {
  /** The block under the player, or null before the first fix. */
  here: string | null;
  /** Hex strength on: blocks take one action per player per day. */
  strength: boolean;
  usedToday: ReadonlySet<string>;
  mine: ReadonlySet<string>;
}): "used" | "owned" | null {
  if (!input.here) return null;
  if (input.strength) return input.usedToday.has(input.here) ? "used" : null;
  return input.mine.has(input.here) ? "owned" : null;
}
