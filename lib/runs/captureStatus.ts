/**
 * What the run screen tells the player about capture, in one word.
 *
 * A run can end with zero blocks and nothing looking wrong: on 10 Nov 2026
 * two players started a run, stopped after three seconds and went looking
 * for a block that was never captured. One phone had no usable GPS fix yet
 * and the other stood on a block its owner already held. The screen showed
 * the same thing in both cases, a timer and "0 blocks". Between 40% and 45%
 * of runs end with zero blocks every day, so this is the common case and
 * not an edge.
 *
 * The second half of the same afternoon: with hex strength on, the first of
 * those runs did reinforce the block under the player, which counts as zero
 * new blocks, and the next run on the same block did nothing at all because
 * a block takes one action per player per day. Neither was said on screen.
 *
 * Order matters. A block on its way to the server is the most useful thing
 * to say, then what is already saved, and only when there is nothing of
 * either does the reason for the silence come up.
 */
export type CaptureStatus =
  | { kind: "saving"; count: number }
  | { kind: "saved"; count: number }
  | { kind: "acted" }
  | { kind: "searching" }
  | { kind: "repeat" }
  | { kind: "owned" }
  | { kind: "ready" };

export function captureStatus(input: {
  /** Blocks waiting to be accepted by the server. */
  pending: number;
  /** Blocks the server has accepted in this run. */
  saved: number;
  /** Blocks reinforced or attacked in this run. They are not new blocks. */
  acted: number;
  /**
   * Passes the server ignored because the player had already acted on that
   * block today. One action per block per player per day.
   */
  repeated: number;
  /** Whether the latest fixes are accurate enough to capture with. */
  fixReady: boolean;
  /** The run started on a block the player already owned. */
  startedOnOwned: boolean;
}): CaptureStatus {
  if (input.pending > 0) return { kind: "saving", count: input.pending };
  if (input.saved > 0) return { kind: "saved", count: input.saved };
  if (input.acted > 0) return { kind: "acted" };
  if (!input.fixReady) return { kind: "searching" };
  if (input.repeated > 0) return { kind: "repeat" };
  if (input.startedOnOwned) return { kind: "owned" };
  return { kind: "ready" };
}
